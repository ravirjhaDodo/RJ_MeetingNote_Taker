import { createCipheriv, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import OpenAI from "openai";
import { QdrantClient } from "@qdrant/js-client-rest";
import {
  PLATFORM_ADMIN_EMAIL,
  PLATFORM_OWNER_USER_ID,
  FEATURE_KEYS,
  buildMeetingNotesUserPrompt,
  buildSpeakerInferencePrompt,
  buildTranslationSystemPrompt,
  canUseFeature,
  canUsePanelTranslation,
  defaultFeaturesForNewUser,
  decryptSecret,
  expiryFromValue,
  internalAuthEmail,
  INTERNAL_AUTH_DOMAIN,
  isPlatformOwner,
  isAdminReservedEmail,
  isProfileAdmin,
  normalizeUserId,
  meetingNotesSystemPrompt,
  ASSEMBLYAI_STREAMING_TOKEN_URL,
  ASSEMBLYAI_BASE_URL,
  buildPrerecordedTranscriptRequest,
  rolesForPrimaryRole,
  nowPlusDays,
  serializeProfile,
  validatePassword,
  validateUserId,
} from "../functions/lib/rj-shared.js";

const NOTES_MODEL = process.env.OPENAI_NOTES_MODEL || process.env.OPENAI_ANSWER_MODEL || "gpt-4.1-mini";
const COLLECTION = process.env.QDRANT_COLLECTION || "rj_meeting_notes";
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const ANSWER_MODEL = process.env.OPENAI_ANSWER_MODEL || "gpt-4.1-mini";
const VECTOR_SIZE = Number(process.env.QDRANT_VECTOR_SIZE || 1536);
const ADMIN_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "RJ Meeting Notes Taker <onboarding@resend.dev>";
const ADMIN_REPLY_TO_EMAIL = process.env.ADMIN_EMAIL || PLATFORM_ADMIN_EMAIL;

let cachedAdmin = null;
let cachedOpenAI = null;
let cachedQdrant = null;

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function firebaseCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new ApiError(500, "FIREBASE_SERVICE_ACCOUNT_JSON is not configured.");
  }
  try {
    return cert(JSON.parse(raw));
  } catch {
    throw new ApiError(500, "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
}

function admin() {
  if (cachedAdmin) return cachedAdmin;
  const app = getApps()[0] || initializeApp({ credential: firebaseCredential() });
  cachedAdmin = { auth: getAuth(app), db: getFirestore(app) };
  return cachedAdmin;
}

function openai() {
  if (!process.env.OPENAI_API_KEY) {
    throw new ApiError(500, "OPENAI_API_KEY is not configured.");
  }
  if (!cachedOpenAI) cachedOpenAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return cachedOpenAI;
}

function qdrant() {
  if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY) {
    throw new ApiError(500, "QDRANT_URL and QDRANT_API_KEY must be configured.");
  }
  if (!cachedQdrant) {
    cachedQdrant = new QdrantClient({
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
    });
  }
  return cachedQdrant;
}

function userIdsRef(userId) {
  return admin().db.collection("userIds").doc(normalizeUserId(userId));
}

function profileRef(uid) {
  return admin().db.collection("users").doc(uid);
}

async function getProfile(uid) {
  const snapshot = await profileRef(uid).get();
  return snapshot.exists ? { uid, ...snapshot.data() } : null;
}

async function requireAuth(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new ApiError(401, "Sign in before using cloud features.");
  try {
    return admin().auth.verifyIdToken(token);
  } catch {
    throw new ApiError(401, "Firebase session is invalid or expired.");
  }
}

function userIdFromAuthEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized.endsWith(`@${INTERNAL_AUTH_DOMAIN}`)) return "";
  return normalizeUserId(normalized.split("@")[0]);
}

function isProfilePlatformAdmin({ email, snapshotData }) {
  const userId = snapshotData?.userId || userIdFromAuthEmail(email);
  const contactEmail = snapshotData?.contactEmail || email;
  return isPlatformOwner({ userId, contactEmail });
}

async function ensureProfileForToken(token) {
  const uid = token.uid;
  const email = token.email || "";
  const displayName = token.name || email.split("@")[0] || "User";
  const photoURL = token.picture || "";
  const ref = profileRef(uid);
  const snapshot = await ref.get();
  const isPlatformAdmin = isProfilePlatformAdmin({ email, snapshotData: snapshot.data() });

  if (!snapshot.exists) {
    const featureDefaults = defaultFeaturesForNewUser({ isPlatformAdmin });
    const parsedUserId = userIdFromAuthEmail(email);
    const baseProfile = {
      userId: parsedUserId || null,
      email,
      contactEmail: isPlatformAdmin ? PLATFORM_ADMIN_EMAIL : email,
      displayName,
      photoURL,
      preferredLanguage: "en",
      role: isPlatformAdmin ? "admin" : "user",
      roles: rolesForPrimaryRole(isPlatformAdmin ? "admin" : "user"),
      status: isPlatformAdmin ? "active" : "pending",
      plan: "free",
      platformApiAccess: isPlatformAdmin ? "admin" : "trial",
      trialEndsAt: isPlatformAdmin ? null : nowPlusDays(7),
      aiNotesTrialEndsAt: featureDefaults.aiNotesTrialEndsAt,
      features: featureDefaults.features,
      guestApiAccess: false,
      guestApiExpiresAt: null,
      subscriptionStatus: "none",
      requiresPasswordChange: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastLoginAt: FieldValue.serverTimestamp(),
    };
    await ref.set(baseProfile);
    return { uid, ...baseProfile };
  }

  const updates = {
    email,
    displayName,
    photoURL,
    lastLoginAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!snapshot.data().features) {
    const migrated = defaultFeaturesForNewUser({ isPlatformAdmin });
    updates.features = migrated.features;
    if (!snapshot.data().aiNotesTrialEndsAt) updates.aiNotesTrialEndsAt = migrated.aiNotesTrialEndsAt;
  }

  if (isPlatformAdmin) {
    updates.role = "admin";
    updates.roles = rolesForPrimaryRole("admin");
    updates.status = "active";
    updates.platformApiAccess = "admin";
    updates.userId = snapshot.data().userId || userIdFromAuthEmail(email) || PLATFORM_OWNER_USER_ID;
    updates.contactEmail = PLATFORM_ADMIN_EMAIL;
    if (!updates.features) {
      const adminFeatures = defaultFeaturesForNewUser({ isPlatformAdmin: true });
      updates.features = adminFeatures.features;
      updates.aiNotesTrialEndsAt = adminFeatures.aiNotesTrialEndsAt;
    }
  } else if (!snapshot.data().roles) {
    updates.roles = rolesForPrimaryRole(snapshot.data().role || "user");
  }

  await ref.set(updates, { merge: true });
  return { uid, ...snapshot.data(), ...updates };
}

async function requireUsableUser(req) {
  const token = await requireAuth(req);
  const profile = await ensureProfileForToken(token);
  if (isProfileAdmin(profile)) return profile;
  if (profile.status !== "active") {
    throw new ApiError(403, `Account is ${profile.status || "not approved"}.`);
  }
  return profile;
}

async function requireAdmin(req) {
  const token = await requireAuth(req);
  const profile = await ensureProfileForToken(token);
  if (!isProfileAdmin(profile)) throw new ApiError(403, "Admin access required.");
  return profile;
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) return { skipped: true };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ADMIN_FROM_EMAIL,
      reply_to: ADMIN_REPLY_TO_EMAIL,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    throw new ApiError(502, `Resend email failed: ${await response.text()}`);
  }
  return response.json();
}

function encryptionKey() {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 24) {
    throw new ApiError(500, "API key encryption secret is not configured.");
  }
  return scryptSync(secret, "rj-meeting-notes-taker", 32);
}

function encryptSecret(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };
}

function guestExpiryFromValue(value, unit) {
  if (unit === "never") return null;
  const amount = Number(value || 10);
  const multipliers = { days: 1, weeks: 7, months: 30, years: 365 };
  return nowPlusDays(amount * (multipliers[unit] || 1));
}

async function ensureCollection() {
  const collections = await qdrant().getCollections();
  if (collections.collections.some((collection) => collection.name === COLLECTION)) return;
  await qdrant().createCollection(COLLECTION, {
    vectors: { size: VECTOR_SIZE, distance: "Cosine" },
  });
}

async function embedText(text) {
  const response = await openai().embeddings.create({ model: EMBEDDING_MODEL, input: text });
  return response.data[0].embedding;
}

function normalizeSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new ApiError(400, "Provide at least one transcript segment.");
  }

  return segments.map((segment, index) => ({
    id: segment.id || randomUUID(),
    speakerId: segment.speakerId ? String(segment.speakerId) : null,
    speaker: String(segment.speaker || "Speaker 1"),
    type: String(segment.type || "notes"),
    text: String(segment.text || "").trim(),
    originalText: String(segment.originalText || segment.text || "").trim(),
    language: segment.language || null,
    timestamp: segment.timestamp || new Date().toISOString(),
    order: Number.isFinite(segment.order) ? segment.order : index,
  })).filter((segment) => segment.text);
}

async function resolveAssemblyAiKey(profile) {
  const snapshot = await profileRef(profile.uid).collection("apiKeys")
    .where("provider", "==", "assemblyai")
    .limit(1)
    .get();
  if (!snapshot.empty) {
    const keyData = snapshot.docs[0].data();
    const secret = decryptSecret(keyData.encryptedKey, process.env.API_KEY_ENCRYPTION_SECRET);
    if (secret) return { key: secret, source: "byok" };
  }

  if (canUseFeature(profile, "speakerDiarization") && process.env.ASSEMBLYAI_API_KEY) {
    return { key: process.env.ASSEMBLYAI_API_KEY, source: "platform" };
  }

  if (isProfileAdmin(profile) && process.env.ASSEMBLYAI_API_KEY) {
    return { key: process.env.ASSEMBLYAI_API_KEY, source: "platform" };
  }

  throw new ApiError(412, "Add an AssemblyAI API key on your profile, or ask an admin to enable speaker diarization.");
}

async function assertAssemblyAiAccess(profile) {
  const snapshot = await profileRef(profile.uid).collection("apiKeys")
    .where("provider", "==", "assemblyai")
    .limit(1)
    .get();
  if (!snapshot.empty) return;
  if (canUseFeature(profile, "speakerDiarization")) return;
  if (isProfileAdmin(profile) && process.env.ASSEMBLYAI_API_KEY) return;
  throw new ApiError(403, "Speaker diarization is not available on your account.");
}

async function resolveOpenAIClient(profile) {
  if (profile.plan === "byok") {
    const snapshot = await profileRef(profile.uid).collection("apiKeys")
      .where("provider", "==", "openai")
      .limit(1)
      .get();
    if (!snapshot.empty) {
      const keyData = snapshot.docs[0].data();
      const secret = decryptSecret(keyData.encryptedKey, process.env.API_KEY_ENCRYPTION_SECRET);
      if (secret) return new OpenAI({ apiKey: secret });
    }
    throw new ApiError(412, "Add an OpenAI API key on your profile for BYOK plan.");
  }
  return openai();
}

async function generateNotesMarkdown(profile, payload) {
  const mode = payload.mode === "summary" ? "summary" : "detail";
  const client = await resolveOpenAIClient(profile);
  const response = await client.responses.create({
    model: NOTES_MODEL,
    input: [
      { role: "system", content: meetingNotesSystemPrompt(mode) },
      {
        role: "user",
        content: buildMeetingNotesUserPrompt({
          mode,
          title: payload.title,
          metadata: payload.metadata,
          sections: payload.sections,
          segments: payload.segments,
        }),
      },
    ],
  });
  return { markdown: response.output_text.trim(), mode };
}

async function saveMeeting(req, data) {
  const profile = await requireUsableUser(req);
  if (!canUseFeature(profile, "cloudEmbeddings")) {
    throw new ApiError(403, "Cloud save is not available on your account.");
  }
  const segments = normalizeSegments(data?.segments);
  await ensureCollection();

  const meetingRef = data?.meetingId
    ? admin().db.collection("users").doc(profile.uid).collection("meetings").doc(data.meetingId)
    : admin().db.collection("users").doc(profile.uid).collection("meetings").doc();
  const batch = admin().db.batch();
  const meetingDoc = {
    title: data?.title || "Untitled meeting",
    updatedAt: FieldValue.serverTimestamp(),
    segmentCount: segments.length,
  };
  if (!data?.meetingId) meetingDoc.createdAt = FieldValue.serverTimestamp();
  if (data?.generatedNotes?.markdown) {
    meetingDoc.generatedNotes = {
      mode: data.generatedNotes.mode || "detail",
      markdown: String(data.generatedNotes.markdown),
      language: data.generatedNotes.language || "en",
      createdAt: new Date().toISOString(),
    };
  }
  batch.set(meetingRef, meetingDoc, { merge: true });

  const points = [];
  for (const segment of segments) {
    batch.set(meetingRef.collection("segments").doc(segment.id), segment);
    points.push({
      id: segment.id,
      vector: await embedText(`${segment.speaker}: ${segment.originalText || segment.text}`),
      payload: {
        uid: profile.uid,
        meetingId: meetingRef.id,
        speaker: segment.speaker,
        type: segment.type,
        text: segment.originalText || segment.text,
        panelText: segment.text,
        timestamp: segment.timestamp,
        order: segment.order,
      },
    });
  }

  await batch.commit();
  await qdrant().upsert(COLLECTION, { wait: true, points });
  return { meetingId: meetingRef.id, segmentCount: segments.length };
}

async function listMeetings(req) {
  const profile = await requireUsableUser(req);
  const snapshot = await admin().db
    .collection("users")
    .doc(profile.uid)
    .collection("meetings")
    .orderBy("updatedAt", "desc")
    .limit(50)
    .get();

  return {
    meetings: snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title || "Untitled meeting",
        segmentCount: data.segmentCount || 0,
        createdAt: data.createdAt?.toDate?.().toISOString?.() || null,
        updatedAt: data.updatedAt?.toDate?.().toISOString?.() || null,
      };
    }),
  };
}

async function getMeeting(req, data) {
  const profile = await requireUsableUser(req);
  const meetingId = String(data?.meetingId || "").trim();
  if (!meetingId) throw new ApiError(400, "Provide meetingId.");

  const meetingRef = admin().db.collection("users").doc(profile.uid).collection("meetings").doc(meetingId);
  const meetingSnap = await meetingRef.get();
  if (!meetingSnap.exists) throw new ApiError(404, "Meeting not found.");

  const segmentsSnap = await meetingRef.collection("segments").get();
  const segments = segmentsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

  const meetingData = meetingSnap.data();
  return {
    meeting: {
      id: meetingSnap.id,
      title: meetingData.title || "Untitled meeting",
      segmentCount: meetingData.segmentCount || segments.length,
      generatedNotes: meetingData.generatedNotes || null,
      createdAt: meetingData.createdAt?.toDate?.().toISOString?.() || null,
      updatedAt: meetingData.updatedAt?.toDate?.().toISOString?.() || null,
    },
    segments,
  };
}

async function askMeeting(req, data) {
  const profile = await requireUsableUser(req);
  if (!canUseFeature(profile, "cloudQA")) {
    throw new ApiError(403, "Cloud Q&A is not available on your account.");
  }
  const question = String(data?.question || "").trim();
  const meetingId = String(data?.meetingId || "").trim();
  if (!question) throw new ApiError(400, "Provide a question.");

  await ensureCollection();
  const matches = await qdrant().search(COLLECTION, {
    vector: await embedText(question),
    filter: {
      must: [
        { key: "uid", match: { value: profile.uid } },
        ...(meetingId ? [{ key: "meetingId", match: { value: meetingId } }] : []),
      ],
    },
    limit: 8,
    with_payload: true,
  });

  const context = matches
    .map((match, index) => `${index + 1}. [${match.payload?.speaker || "Speaker 1"}] ${match.payload?.text || ""}`)
    .join("\n");

  const response = await openai().responses.create({
    model: ANSWER_MODEL,
    input: [
      {
        role: "system",
        content: "Answer using only the meeting transcript context. If the context does not contain the answer, say you do not have enough information.",
      },
      { role: "user", content: `Question: ${question}\n\nMeeting context:\n${context}` },
    ],
  });

  return {
    answer: response.output_text,
    sources: matches.map((match) => ({
      score: match.score,
      speaker: match.payload?.speaker,
      text: match.payload?.text,
      timestamp: match.payload?.timestamp,
      meetingId: match.payload?.meetingId,
    })),
  };
}

async function ensureUserProfile(req) {
  const profile = await ensureProfileForToken(await requireAuth(req));
  return { profile: serializeProfile(profile) };
}

async function updateUserProfile(req, data) {
  const profile = await ensureProfileForToken(await requireAuth(req));
  const updates = {
    displayName: String(data?.displayName || profile.displayName || "").trim(),
    photoURL: String(data?.photoURL || profile.photoURL || "").trim(),
    preferredLanguage: String(data?.preferredLanguage || profile.preferredLanguage || "en").trim(),
    firstName: data?.firstName != null ? String(data.firstName).trim() : profile.firstName,
    lastName: data?.lastName != null ? String(data.lastName).trim() : profile.lastName,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await profileRef(profile.uid).set(updates, { merge: true });
  return { profile: serializeProfile({ ...profile, ...updates }) };
}

async function listUsers(req) {
  await requireAdmin(req);
  const snapshot = await admin().db.collection("users").orderBy("createdAt", "desc").limit(100).get();
  return {
    users: snapshot.docs.map((doc) => {
      const data = doc.data();
      return serializeProfile({ uid: doc.id, ...data });
    }),
  };
}

async function adminUpdateUser(req, data) {
  await requireAdmin(req);
  const {
    uid,
    action,
    guestAmount,
    guestUnit = "days",
    featureKey,
    amount,
    unit = "days",
    plan,
  } = data || {};
  if (!uid || !action) throw new ApiError(400, "uid and action are required.");
  const target = await getProfile(uid);
  if (!target) throw new ApiError(404, "User profile not found.");

  const updates = { updatedAt: FieldValue.serverTimestamp() };
  const contactEmail = target.contactEmail || target.email;
  const messages = {
    approve: ["active", "Your RJ Meeting Notes Taker account was approved."],
    reject: ["rejected", "Your RJ Meeting Notes Taker signup was rejected."],
    pause: ["paused", "Your RJ Meeting Notes Taker account was paused."],
    revoke: ["revoked", "Your RJ Meeting Notes Taker account access was revoked."],
  };

  if (messages[action]) {
    updates.status = messages[action][0];
    await profileRef(uid).set(updates, { merge: true });
    await sendEmail({
      to: contactEmail,
      subject: messages[action][1],
      html: `<p>${messages[action][1]}</p><p>Contact ${ADMIN_REPLY_TO_EMAIL} with questions.</p>`,
    });
    return { ok: true };
  }

  if (action === "makeAdmin") {
    updates.role = "admin";
    updates.roles = rolesForPrimaryRole("admin");
  }
  if (action === "makeUser") {
    updates.role = "user";
    updates.roles = rolesForPrimaryRole("user");
  }
  if (action === "setPlan" && ["free", "paid", "byok"].includes(plan)) updates.plan = plan;
  if (action === "guest") {
    updates.guestApiAccess = true;
    updates.platformApiAccess = "guest";
    updates.guestApiExpiresAt = guestExpiryFromValue(guestAmount || 10, guestUnit);
  }
  if (action === "stopGuest") {
    updates.guestApiAccess = false;
    updates.guestApiExpiresAt = null;
    updates.platformApiAccess = target.plan === "paid" ? "paid" : "trial";
  }

  if (action === "updateDetails") {
    if (typeof data.contactEmail === "string") {
      const email = data.contactEmail.trim().toLowerCase();
      if (email && !email.includes("@")) throw new ApiError(400, "A valid contact email is required.");
      if (isAdminReservedEmail({ userId: target.userId, contactEmail: email })) {
        throw new ApiError(403, "This email address is reserved for the platform owner and cannot be assigned to another account.");
      }
      updates.contactEmail = email;
    }
    if (typeof data.firstName === "string") updates.firstName = data.firstName.trim();
    if (typeof data.lastName === "string") updates.lastName = data.lastName.trim();
    const nextFirst = updates.firstName ?? target.firstName ?? "";
    const nextLast = updates.lastName ?? target.lastName ?? "";
    const derivedName = `${nextFirst} ${nextLast}`.trim();
    if (derivedName) updates.displayName = derivedName;
  }

  if (["extendFeature", "pauseFeature", "resumeFeature"].includes(action)) {
    if (!FEATURE_KEYS.includes(featureKey)) throw new ApiError(400, "Invalid featureKey.");
    const features = { ...(target.features || {}) };
    const current = features[featureKey] || { status: "paused", expiresAt: null, source: "admin" };
    if (action === "pauseFeature") {
      features[featureKey] = { ...current, status: "paused" };
    } else if (action === "resumeFeature") {
      features[featureKey] = { ...current, status: "active", source: current.source || "admin" };
    } else {
      const expiresAt = expiryFromValue(amount || 7, unit);
      features[featureKey] = { status: "active", expiresAt, source: "admin" };
      if (featureKey === "aiMeetingNotes") updates.aiNotesTrialEndsAt = expiresAt;
    }
    updates.features = features;
  }

  await profileRef(uid).set(updates, { merge: true });
  return { ok: true };
}

async function adminGenerateTemporaryPassword(req, data) {
  await requireAdmin(req);
  if (!data?.uid) throw new ApiError(400, "uid is required.");
  const target = await getProfile(data.uid);
  if (!target) throw new ApiError(404, "User profile not found.");

  const tempPassword = `RJ-${randomBytes(6).toString("base64url")}!9`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await admin().auth.updateUser(data.uid, { password: tempPassword });
  await profileRef(data.uid).set({
    temporaryPasswordExpiresAt: expiresAt,
    requiresPasswordChange: true,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await sendEmail({
    to: target.email,
    subject: "Temporary RJ Meeting Notes Taker password",
    html: `<p>Your temporary password is <strong>${tempPassword}</strong>.</p><p>It expires in 24 hours. Please sign in and change it immediately.</p>`,
  });

  return { ok: true, expiresAt: expiresAt.toISOString() };
}

async function adminDeleteUser(req, data) {
  const adminProfile = await requireAdmin(req);
  if (!data?.uid) throw new ApiError(400, "uid is required.");
  const target = await getProfile(data.uid);
  if (!target) throw new ApiError(404, "User profile not found.");
  if (isPlatformOwner({ userId: target.userId })) {
    throw new ApiError(403, "The platform owner account cannot be deleted.");
  }
  if (adminProfile.uid === data.uid) {
    throw new ApiError(400, "You cannot delete your own account.");
  }

  try {
    await admin().auth.deleteUser(data.uid);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }
  await admin().db.recursiveDelete(profileRef(data.uid));
  if (target.userId) await userIdsRef(target.userId).delete();

  return { ok: true };
}

async function saveUserApiKey(req, data) {
  const profile = await requireUsableUser(req);
  const trimmedKey = String(data?.apiKey || "").trim();
  if (!trimmedKey) throw new ApiError(400, "API key is required.");

  const keyRef = profileRef(profile.uid).collection("apiKeys").doc();
  await keyRef.set({
    provider: String(data?.provider || "custom"),
    label: String(data?.label || data?.provider || "API key"),
    endpoint: String(data?.endpoint || ""),
    encryptedKey: encryptSecret(trimmedKey),
    last4: trimmedKey.slice(-4),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { id: keyRef.id, last4: trimmedKey.slice(-4) };
}

async function listUserApiKeys(req) {
  const profile = await requireUsableUser(req);
  const snapshot = await profileRef(profile.uid).collection("apiKeys").orderBy("createdAt", "desc").get();
  return {
    keys: snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        provider: data.provider,
        label: data.label,
        endpoint: data.endpoint,
        last4: data.last4,
        createdAt: data.createdAt?.toDate?.().toISOString?.() || null,
      };
    }),
  };
}

async function deleteUserApiKey(req, data) {
  const profile = await requireUsableUser(req);
  if (!data?.keyId) throw new ApiError(400, "keyId is required.");
  await profileRef(profile.uid).collection("apiKeys").doc(data.keyId).delete();
  return { ok: true };
}

async function checkUserIdAvailability(_req, data) {
  const validation = validateUserId(data?.userId);
  if (!validation.ok) return { available: false, reason: validation.error };
  const snapshot = await userIdsRef(validation.userId).get();
  return { available: !snapshot.exists, userId: validation.userId };
}

async function registerAccount(_req, data) {
  const {
    userId,
    firstName,
    lastName,
    contactEmail,
    password,
    confirmPassword,
  } = data || {};

  const idValidation = validateUserId(userId);
  if (!idValidation.ok) throw new ApiError(400, idValidation.error);

  const pwdValidation = validatePassword(password);
  if (!pwdValidation.ok) throw new ApiError(400, pwdValidation.error);
  if (password !== confirmPassword) throw new ApiError(400, "Passwords do not match.");

  const email = String(contactEmail || "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new ApiError(400, "A valid contact email is required.");

  const normalizedUserId = idValidation.userId;
  if (isAdminReservedEmail({ userId: normalizedUserId, contactEmail: email })) {
    throw new ApiError(403, "This email address is reserved and cannot be used. Please use a different contact email.");
  }
  const registryRef = userIdsRef(normalizedUserId);
  if ((await registryRef.get()).exists) throw new ApiError(409, "UserID is already taken.");

  const owner = isPlatformOwner({ userId: normalizedUserId, contactEmail: email });
  const authEmail = internalAuthEmail(normalizedUserId);
  const displayName = `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim() || normalizedUserId;

  let createdUser;
  try {
    createdUser = await admin().auth.createUser({ email: authEmail, password, displayName });
  } catch (error) {
    throw new ApiError(500, error.message || "Could not create account.");
  }

  const featureDefaults = defaultFeaturesForNewUser({ isPlatformAdmin: owner });
  const profile = {
    userId: normalizedUserId,
    email: authEmail,
    contactEmail: email,
    firstName: String(firstName || "").trim(),
    lastName: String(lastName || "").trim(),
    displayName,
    photoURL: "",
    preferredLanguage: "en",
    role: owner ? "admin" : "user",
    roles: rolesForPrimaryRole(owner ? "admin" : "user"),
    status: owner ? "active" : "pending",
    plan: "free",
    platformApiAccess: owner ? "admin" : "trial",
    trialEndsAt: owner ? null : nowPlusDays(7),
    aiNotesTrialEndsAt: featureDefaults.aiNotesTrialEndsAt,
    features: featureDefaults.features,
    guestApiAccess: false,
    guestApiExpiresAt: null,
    subscriptionStatus: "none",
    requiresPasswordChange: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
  };

  const batch = admin().db.batch();
  batch.set(registryRef, { uid: createdUser.uid, contactEmail: email, createdAt: FieldValue.serverTimestamp() });
  batch.set(profileRef(createdUser.uid), profile);
  await batch.commit();

  // Account is already created above; a failed notification email must not fail signup.
  try {
    await sendEmail({
      to: email,
      subject: owner ? "RJ Meeting Notes Taker owner account ready" : "RJ Meeting Notes Taker signup received",
      html: owner
        ? `<p>Your owner account <strong>${normalizedUserId}</strong> is active.</p>`
        : `<p>Thanks for signing up as <strong>${normalizedUserId}</strong>. Your account is pending admin approval.</p>`,
    });
  } catch (error) {
    console.warn(`registerAccount: signup email to ${email} failed (account still created): ${error?.message || error}`);
  }

  return { uid: createdUser.uid, userId: normalizedUserId, status: profile.status };
}

async function requestPasswordReset(_req, data) {
  const validation = validateUserId(data?.userId);
  if (!validation.ok) return { ok: true, message: "If an account exists, a reset email was sent." };

  const registry = await userIdsRef(validation.userId).get();
  if (!registry.exists) return { ok: true, message: "If an account exists, a reset email was sent." };

  const profile = await getProfile(registry.data().uid);
  if (!profile) return { ok: true, message: "If an account exists, a reset email was sent." };

  const link = await admin().auth.generatePasswordResetLink(internalAuthEmail(validation.userId));
  await sendEmail({
    to: profile.contactEmail || profile.email,
    subject: "Reset your RJ Meeting Notes Taker password",
    html: `<p>Reset your password for UserID <strong>${validation.userId}</strong>.</p><p><a href="${link}">Reset password</a></p>`,
  });
  return { ok: true, message: "If an account exists, a reset email was sent." };
}

async function requestUserIdReminder(_req, data) {
  const email = String(data?.contactEmail || "").trim().toLowerCase();
  if (!email) throw new ApiError(400, "Contact email is required.");

  const snapshot = await admin().db.collection("users").where("contactEmail", "==", email).limit(20).get();
  const userIds = snapshot.docs.map((doc) => doc.data().userId).filter(Boolean);
  if (userIds.length) {
    await sendEmail({
      to: email,
      subject: "Your RJ Meeting Notes Taker UserIDs",
      html: `<p>UserIDs linked to this email:</p><ul>${userIds.map((id) => `<li><strong>${id}</strong></li>`).join("")}</ul>`,
    });
  }
  return { ok: true, message: "If accounts exist for that email, we sent your UserIDs." };
}

async function generateMeetingNotes(req, data) {
  const profile = await requireUsableUser(req);
  if (!canUseFeature(profile, "aiMeetingNotes")) {
    throw new ApiError(403, "AI meeting notes are not available on your account.");
  }
  if (!Array.isArray(data?.segments) || !data.segments.length) {
    throw new ApiError(400, "Provide transcript segments.");
  }
  return generateNotesMarkdown(profile, data);
}

async function translateTranscript(req, data) {
  const profile = await ensureProfileForToken(await requireAuth(req));
  const text = String(data?.text || "").trim();
  const targetLanguage = String(data?.targetLanguage || "en").trim();
  const sourceLanguage = String(data?.sourceLanguage || "").trim();
  if (targetLanguage !== "en" && !canUsePanelTranslation(profile)) {
    throw new ApiError(403, "Panel B translation is not available on your account.");
  }
  if (!text) throw new ApiError(400, "Text is required.");

  const speakerContext = data?.speakerContext || null;
  const meetingSpeakers = data?.meetingSpeakers || [];

  const response = await openai().responses.create({
    model: ANSWER_MODEL,
    input: [
      {
        role: "system",
        content: buildTranslationSystemPrompt({
          sourceLanguage,
          targetLanguage,
          speakerContext,
          meetingSpeakers,
        }),
      },
      { role: "user", content: text },
    ],
  });

  return { translation: response.output_text.trim(), targetLanguage, sourceLanguage: sourceLanguage || null };
}

const PRERECORDED_MAX_POLL_ATTEMPTS = 90;
const PRERECORDED_POLL_MS = 2000;
const TRANSCRIBE_AUDIO_MAX_BYTES = 9 * 1024 * 1024;

async function transcribePrerecorded(key, bytes, { languageCode, speakerLabels = false, keyterms = [] } = {}) {
  const uploadResponse = await fetch(`${ASSEMBLYAI_BASE_URL}/v2/upload`, {
    method: "POST",
    headers: { Authorization: key },
    body: bytes,
  });
  if (!uploadResponse.ok) {
    throw new ApiError(502, `AssemblyAI upload failed: ${await uploadResponse.text()}`);
  }

  const uploadData = await uploadResponse.json();
  const uploadUrl = uploadData?.upload_url;
  if (!uploadUrl) throw new ApiError(502, "AssemblyAI did not return an upload URL.");

  const transcriptBody = {
    audio_url: uploadUrl,
    ...buildPrerecordedTranscriptRequest(languageCode, { keyterms, speakerLabels }),
  };

  const submitResponse = await fetch(`${ASSEMBLYAI_BASE_URL}/v2/transcript`, {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json" },
    body: JSON.stringify(transcriptBody),
  });
  if (!submitResponse.ok) {
    throw new ApiError(502, `AssemblyAI transcript submit failed: ${await submitResponse.text()}`);
  }

  const submitData = await submitResponse.json();
  const transcriptId = submitData?.id;
  if (!transcriptId) throw new ApiError(502, "AssemblyAI did not return a transcript id.");

  for (let attempt = 0; attempt < PRERECORDED_MAX_POLL_ATTEMPTS; attempt += 1) {
    const pollResponse = await fetch(`${ASSEMBLYAI_BASE_URL}/v2/transcript/${transcriptId}`, {
      headers: { Authorization: key },
    });
    if (!pollResponse.ok) {
      throw new ApiError(502, `AssemblyAI poll failed: ${await pollResponse.text()}`);
    }

    const result = await pollResponse.json();
    if (result.status === "completed") {
      return {
        text: String(result.text || "").trim(),
        utterances: Array.isArray(result.utterances) ? result.utterances : null,
        languageCode: result.language_code || languageCode,
        model: result.speech_model_used || null,
      };
    }
    if (result.status === "error") {
      throw new ApiError(502, result.error || "AssemblyAI transcription failed.");
    }

    await new Promise((resolve) => setTimeout(resolve, PRERECORDED_POLL_MS));
  }

  throw new ApiError(504, "AssemblyAI transcription timed out.");
}

async function transcribeAudioChunk(req, data) {
  const profile = await requireUsableUser(req);
  await assertAssemblyAiAccess(profile);
  const { key } = await resolveAssemblyAiKey(profile);

  const audioBase64 = String(data?.audioBase64 || "").trim();
  const languageCode = String(data?.languageCode || "hi").trim().toLowerCase();
  const full = Boolean(data?.full);
  const keyterms = Array.isArray(data?.keyterms)
    ? data.keyterms.map((term) => String(term || "").trim()).filter(Boolean).slice(0, 200)
    : [];

  if (!audioBase64) throw new ApiError(400, "audioBase64 is required.");
  if (!languageCode || languageCode.length < 2) throw new ApiError(400, "languageCode is required.");

  let bytes;
  try {
    bytes = Buffer.from(audioBase64, "base64");
  } catch {
    throw new ApiError(400, "audioBase64 is not valid base64.");
  }

  if (!bytes.length) throw new ApiError(400, "Audio payload is empty.");
  if (bytes.length > TRANSCRIBE_AUDIO_MAX_BYTES) {
    throw new ApiError(
      400,
      full
        ? "Recording is too large for a final pass. Chunked transcript was kept."
        : "Audio chunk is too large.",
    );
  }

  const result = await transcribePrerecorded(key, bytes, {
    languageCode,
    speakerLabels: false,
    keyterms,
  });

  return {
    text: result.text,
    utterances: result.utterances,
    languageCode: result.languageCode,
    model: result.model,
    full,
  };
}

async function getAssemblyAiStreamingToken(req) {
  const profile = await requireUsableUser(req);
  await assertAssemblyAiAccess(profile);
  const { key } = await resolveAssemblyAiKey(profile);

  const response = await fetch(ASSEMBLYAI_STREAMING_TOKEN_URL, {
    headers: { Authorization: key },
  });

  if (!response.ok) {
    throw new ApiError(502, `AssemblyAI token request failed: ${await response.text()}`);
  }

  const data = await response.json();
  if (!data?.token) throw new ApiError(502, "AssemblyAI did not return a streaming token.");

  const expiresIn = Number(data.expires_in_seconds || data.expires_in || 360);
  return {
    token: data.token,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

async function inferSpeakerNames(req, data) {
  const profile = await requireUsableUser(req);
  const segments = Array.isArray(data?.segments) ? data.segments : [];
  if (!segments.length) throw new ApiError(400, "Provide transcript segments.");

  const canUseAi = canUseFeature(profile, "aiMeetingNotes") || canUseFeature(profile, "autoTranslate");
  if (!canUseAi) {
    throw new ApiError(403, "Speaker name inference requires AI notes or auto-translate access.");
  }

  const client = await resolveOpenAIClient(profile);
  const response = await client.responses.create({
    model: ANSWER_MODEL,
    input: [
      {
        role: "system",
        content: "Return valid JSON only. No markdown fences or commentary.",
      },
      {
        role: "user",
        content: buildSpeakerInferencePrompt(segments.slice(-12)),
      },
    ],
  });

  let parsed = { suggestions: [] };
  try {
    parsed = JSON.parse(response.output_text.trim());
  } catch {
    const match = response.output_text.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  }

  const suggestions = (parsed.suggestions || [])
    .filter((item) => item?.speakerId && item?.suggestedName)
    .map((item) => ({
      speakerId: String(item.speakerId),
      suggestedName: String(item.suggestedName).trim(),
      confidence: Number(item.confidence) || 0,
    }))
    .filter((item) => item.suggestedName && item.confidence >= 0.55)
    .filter((item) => !/introduction|self-introduction/i.test(item.suggestedName));

  return { suggestions };
}

const publicActions = new Set([
  "checkUserIdAvailability",
  "registerAccount",
  "requestPasswordReset",
  "requestUserIdReminder",
]);

const actions = {
  adminDeleteUser,
  adminGenerateTemporaryPassword,
  adminUpdateUser,
  askMeeting,
  checkUserIdAvailability,
  deleteUserApiKey,
  ensureUserProfile,
  generateMeetingNotes,
  getAssemblyAiStreamingToken,
  transcribeAudioChunk,
  inferSpeakerNames,
  getMeeting,
  listMeetings,
  listUserApiKeys,
  listUsers,
  registerAccount,
  requestPasswordReset,
  requestUserIdReminder,
  saveMeeting,
  saveUserApiKey,
  translateTranscript,
  updateUserProfile,
};

function applyCors(req, res) {
  const origin = String(req.headers.origin || "");
  const allowed =
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  return allowed;
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    const { action, data } = req.body || {};
    if (!actions[action]) throw new ApiError(404, `Unknown action: ${action}`);
    res.status(200).json(await actions[action](req, data || {}));
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message || "Unexpected server error." });
  }
}
