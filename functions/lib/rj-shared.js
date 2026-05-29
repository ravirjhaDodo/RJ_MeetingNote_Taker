import { createDecipheriv } from "node:crypto";
import { scryptSync } from "node:crypto";

export const INTERNAL_AUTH_DOMAIN = "accounts.rj-meeting-notes-taker.app";
export const PLATFORM_ADMIN_EMAIL = "ravirjha@gmail.com";
export const PLATFORM_OWNER_USER_ID = "ravirjha";
export const RESERVED_USER_IDS = new Set(["admin", "root", "support", "system", "api", "help"]);

export const FEATURE_KEYS = ["aiMeetingNotes", "cloudQA", "cloudEmbeddings", "autoTranslate", "speakerDiarization"];

/** AssemblyAI v3 token endpoint; expires_in_seconds is required. */
export const ASSEMBLYAI_STREAMING_TOKEN_URL =
  "https://streaming.assemblyai.com/v3/token?expires_in_seconds=600&max_session_duration_seconds=10800";

/** AssemblyAI pre-recorded REST API base URL. */
export const ASSEMBLYAI_BASE_URL = "https://api.assemblyai.com";

/** Languages where Universal-3 Pro pre-recorded is supported (others use universal-2). */
export const ASSEMBLYAI_U3_LANGUAGE_CODES = new Set(["en", "es", "de", "fr", "pt", "it"]);

export function speechModelsForLanguageCode(languageCode) {
  const code = String(languageCode || "hi").trim().toLowerCase().split("-")[0];
  if (ASSEMBLYAI_U3_LANGUAGE_CODES.has(code)) {
    return ["universal-3-pro", "universal-2"];
  }
  return ["universal-2"];
}

export function buildPrerecordedTranscriptRequest(languageCode, { keyterms = [], speakerLabels = false } = {}) {
  const code = String(languageCode || "hi").trim().toLowerCase();
  const body = {
    speech_models: speechModelsForLanguageCode(code),
    language_code: code,
    punctuate: true,
    format_text: true,
  };
  if (speakerLabels) body.speaker_labels = true;
  const terms = (Array.isArray(keyterms) ? keyterms : [])
    .map((term) => String(term || "").trim())
    .filter((term) => term.length >= 2 && term.length <= 48)
    .slice(0, 200);
  if (terms.length) body.keyterms_prompt = terms;
  return body;
}
export const FEATURE_LABELS = {
  aiMeetingNotes: "AI meeting notes",
  cloudQA: "Cloud Q&A",
  cloudEmbeddings: "Cloud embeddings",
  autoTranslate: "Auto-translate",
  speakerDiarization: "Speaker diarization",
};

export const ROLE_KEYS = ["admin", "user"];
export const ROLE_LABELS = {
  admin: "Admin",
  user: "Meeting",
};
export const ROLE_HOME_PAGES = {
  admin: "adminPage",
  user: "meetingPage",
};

export function rolesForPrimaryRole(role) {
  if (role === "admin") return ["admin", "user"];
  return ["user"];
}

export function normalizeProfileRoles(profile) {
  if (!profile) return [];
  const fromArray = Array.isArray(profile.roles)
    ? profile.roles.filter((role) => ROLE_KEYS.includes(role))
    : [];
  if (fromArray.length) return [...new Set(fromArray)];
  if (profile.role === "admin") return ["admin", "user"];
  if (profile.role && ROLE_KEYS.includes(profile.role)) return [profile.role];
  return ["user"];
}

export function profileHasRole(profile, role) {
  return normalizeProfileRoles(profile).includes(role);
}

export function isProfileAdmin(profile) {
  return profileHasRole(profile, "admin") || profile?.role === "admin";
}

export function nowPlusDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function expiryFromValue(value, unit) {
  if (unit === "never") return null;
  const amount = Number(value || 1);
  const multipliers = { days: 1, weeks: 7, months: 30, years: 365 };
  return nowPlusDays(amount * (multipliers[unit] || 1));
}

export function normalizeUserId(raw) {
  return String(raw || "").trim().toLowerCase();
}

export function validateUserId(userId) {
  const normalized = normalizeUserId(userId);
  if (!normalized) return { ok: false, error: "UserID is required." };
  if (normalized.length < 3 || normalized.length > 24) {
    return { ok: false, error: "UserID must be 3–24 characters." };
  }
  if (!/^[a-z][a-z0-9_]*$/.test(normalized)) {
    return { ok: false, error: "UserID must start with a letter and use only letters, numbers, and underscore." };
  }
  if (RESERVED_USER_IDS.has(normalized)) {
    return { ok: false, error: "This UserID is reserved." };
  }
  return { ok: true, userId: normalized };
}

export function internalAuthEmail(userId) {
  return `${normalizeUserId(userId)}@${INTERNAL_AUTH_DOMAIN}`;
}

export function defaultFeaturesForNewUser({ isPlatformAdmin = false } = {}) {
  const trialEnd = nowPlusDays(7);
  if (isPlatformAdmin) {
    const adminFeature = { status: "active", expiresAt: null, source: "admin" };
    return {
      aiNotesTrialEndsAt: null,
      features: {
        aiMeetingNotes: { ...adminFeature },
        cloudQA: { ...adminFeature },
        cloudEmbeddings: { ...adminFeature },
        autoTranslate: { ...adminFeature },
        speakerDiarization: { ...adminFeature },
      },
    };
  }

  return {
    aiNotesTrialEndsAt: trialEnd,
    features: {
      aiMeetingNotes: { status: "active", expiresAt: trialEnd, source: "trial" },
      cloudQA: { status: "paused", expiresAt: null, source: "admin" },
      cloudEmbeddings: { status: "paused", expiresAt: null, source: "admin" },
      autoTranslate: { status: "active", expiresAt: trialEnd, source: "trial" },
      speakerDiarization: { status: "paused", expiresAt: null, source: "admin" },
    },
  };
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function serializeFeature(feature) {
  if (!feature) return null;
  const expiresAt = parseDate(feature.expiresAt);
  return {
    status: feature.status || "paused",
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    source: feature.source || "admin",
  };
}

export function serializeProfile(profile) {
  if (!profile) return null;
  const features = profile.features || {};
  return {
    uid: profile.uid,
    userId: profile.userId || null,
    email: profile.email,
    contactEmail: profile.contactEmail || profile.email,
    displayName: profile.displayName,
    firstName: profile.firstName || "",
    lastName: profile.lastName || "",
    photoURL: profile.photoURL || "",
    role: profile.role,
    roles: normalizeProfileRoles(profile),
    status: profile.status,
    plan: profile.plan || "free",
    preferredLanguage: profile.preferredLanguage || "en",
    platformApiAccess: profile.platformApiAccess,
    guestApiAccess: profile.guestApiAccess,
    guestApiExpiresAt: parseDate(profile.guestApiExpiresAt)?.toISOString?.() || profile.guestApiExpiresAt || null,
    trialEndsAt: parseDate(profile.trialEndsAt)?.toISOString?.() || profile.trialEndsAt || null,
    aiNotesTrialEndsAt: parseDate(profile.aiNotesTrialEndsAt)?.toISOString?.() || profile.aiNotesTrialEndsAt || null,
    features: {
      aiMeetingNotes: serializeFeature(features.aiMeetingNotes),
      cloudQA: serializeFeature(features.cloudQA),
      cloudEmbeddings: serializeFeature(features.cloudEmbeddings),
      autoTranslate: serializeFeature(features.autoTranslate),
      speakerDiarization: serializeFeature(features.speakerDiarization),
    },
    lastLoginAt: parseDate(profile.lastLoginAt)?.toISOString?.() || null,
    createdAt: parseDate(profile.createdAt)?.toISOString?.() || null,
  };
}

export function canUseFeature(profile, featureKey) {
  if (!profile) return false;
  if (isProfileAdmin(profile)) return true;
  if (profile.status !== "active") return false;

  const features = profile.features || {};
  const feature = features[featureKey];
  if (!feature || feature.status === "paused") return false;
  if (feature.status === "expired") return false;

  const expiresAt = parseDate(feature.expiresAt);
  if (expiresAt && expiresAt < new Date()) return false;

  if (featureKey === "aiMeetingNotes" && feature.source === "trial") {
    const trialEnd = parseDate(profile.aiNotesTrialEndsAt);
    if (trialEnd && trialEnd < new Date()) return false;
  }

  return true;
}

/** Panel B / cloud translate to a non-English target language. */
export function canUsePanelTranslation(profile) {
  if (!profile) return false;
  if (isProfileAdmin(profile)) return true;
  return canUseFeature(profile, "autoTranslate") || canUseFeature(profile, "aiMeetingNotes");
}

export function assertFeatureAccess(profile, featureKey) {
  if (canUseFeature(profile, featureKey)) return;
  const label = FEATURE_LABELS[featureKey] || featureKey;
  const error = new Error(`${label} is not available on your account. Sign up, wait for approval, or contact an admin.`);
  error.code = "permission-denied";
  throw error;
}

export function validatePassword(password) {
  const value = String(password || "");
  if (value.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return { ok: false, error: "Password must include at least one letter and one number." };
  }
  return { ok: true };
}

export function meetingNotesSystemPrompt(mode) {
  const lengthRule = mode === "summary"
    ? "Keep the document concise (roughly one page). Focus on decisions, action items, risks, and open questions."
    : "Write a thorough meeting record with clear sections and enough detail that someone who missed the meeting can follow what happened.";

  return `You write professional meeting notes for business teams. ${lengthRule}

Rules:
- Write in natural, human prose. Avoid generic AI phrases like "In conclusion" or "This meeting covered".
- Do NOT use emojis anywhere.
- You MAY use colored status indicator balls ONLY as single Unicode circles before items:
  - Red circle (U+1F534) for blocked or critical
  - Yellow circle (U+1F7E1) for at risk or needs attention
  - Green circle (U+1F7E2) for done or on track
  - Blue circle (U+1F535) for pending or not started
- Use status balls on action items, and on decisions or risks when progress can be inferred from the transcript.
- Use Markdown tables where they improve clarity (action items, decisions, attendees, timeline).
- Use clear section headings (## Meeting overview, ## Key decisions, ## Action items, ## Risks, ## Open questions, ## Next steps).
- Output Markdown only. No preamble or closing commentary.`;
}

export function buildMeetingNotesUserPrompt({ mode, title, metadata, sections, segments }) {
  const sectionText = Object.entries(sections || {})
    .filter(([, lines]) => lines?.length)
    .map(([key, lines]) => `### ${key}\n${lines.join("\n")}`)
    .join("\n\n");

  const transcript = (segments || [])
    .map((segment) => `[${segment.timestamp || ""}] ${segment.speaker}: ${segment.text}`)
    .join("\n");

  return `Mode: ${mode}
Meeting title: ${title || "Untitled meeting"}
Metadata: ${JSON.stringify(metadata || {})}

Structured sections:
${sectionText || "(none)"}

Translated transcript:
${transcript || "(empty)"}`;
}

export function decryptSecret(payload, encryptionSecret) {
  if (!payload?.ciphertext) return null;
  const key = scryptSync(encryptionSecret, "rj-meeting-notes-taker", 32);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function isPlatformOwner({ userId }) {
  // Owner is identified ONLY by the unique, controlled UserID. The contact email
  // is user-supplied and unverified, so it must never grant owner/admin rights
  // (otherwise anyone signing up with the owner's email becomes admin).
  return normalizeUserId(userId) === PLATFORM_OWNER_USER_ID;
}

/**
 * The platform admin email is reserved exclusively for the owner UserID.
 * Any other account attempting to use it as a contact email must be rejected,
 * even though ordinary contact emails may be shared across multiple accounts.
 */
export function isAdminReservedEmail({ userId, contactEmail }) {
  return String(contactEmail || "").trim().toLowerCase() === PLATFORM_ADMIN_EMAIL
    && normalizeUserId(userId) !== PLATFORM_OWNER_USER_ID;
}

export function buildSpeakerInferencePrompt(segments) {
  const lines = (segments || [])
    .map((segment) => `${segment.speakerId || segment.speaker}: ${segment.text || segment.originalText || ""}`)
    .join("\n");
  return `You analyze meeting transcript segments and suggest speaker display names.

Rules:
- Return JSON only: { "suggestions": [ { "speakerId": "...", "suggestedName": "...", "confidence": 0.0-1.0 } ] }
- Use self-introductions ("I'm Ravi"), third-person references ("Action item for Maya"), and explicit name mentions.
- Only suggest names that appear clearly in the transcript.
- Do not invent names.
- Never use phrases like "self-introduction" as a name — only real person names (e.g. Ravi, Harjeet).
- confidence >= 0.7 for clear self-intros; lower for indirect references.

Segments:
${lines || "(empty)"}`;
}

/** Languages where verbs/adjectives agree with speaker gender (e.g. Hindi). */
export const GENDERED_TARGET_LANGUAGES = new Set(["hi", "pa", "ta", "fr", "es", "ar", "mr", "bn", "gu"]);

export function normalizeTranslationSpeakerContext(speakerContext) {
  if (!speakerContext || typeof speakerContext !== "object") return null;
  const name = String(speakerContext.name || "").trim();
  const gender = String(speakerContext.gender || "").trim().toLowerCase();
  if (!name) return null;
  if (gender !== "male" && gender !== "female") return { name, gender: null };
  return { name, gender };
}

export function normalizeMeetingSpeakers(meetingSpeakers) {
  if (!Array.isArray(meetingSpeakers)) return [];
  const seen = new Set();
  return meetingSpeakers
    .map((entry) => {
      const name = String(entry?.name || "").trim();
      const gender = String(entry?.gender || "").trim().toLowerCase();
      if (!name || (gender !== "male" && gender !== "female")) return null;
      const key = `${name.toLowerCase()}|${gender}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return { name, gender };
    })
    .filter(Boolean);
}

export function buildTranslationSystemPrompt({
  sourceLanguage = "",
  targetLanguage = "en",
  speakerContext = null,
  meetingSpeakers = [],
} = {}) {
  const sourceHint = sourceLanguage
    ? `Source language is ${sourceLanguage}. `
    : "Detect the source language automatically. ";

  const targetBase = String(targetLanguage || "en").split("-")[0].toLowerCase();
  const speaker = normalizeTranslationSpeakerContext(speakerContext);
  const roster = normalizeMeetingSpeakers(meetingSpeakers);

  let genderRules = "";
  if (GENDERED_TARGET_LANGUAGES.has(targetBase)) {
    genderRules = `

Gender and grammar (required for ${targetLanguage}):
- Use correct gender agreement for verbs, adjectives, and pronouns (e.g. Hindi: करता/करती, गया/गई, उसने/उसने when referring to the right person).
- Do not default all people to masculine forms.
- Relationship words: wife/पत्नी/স্ত্রী → female; husband/पति/স্বামী → male.
- When a woman's name is mentioned (e.g. Harjeet as "my wife"), use feminine agreement for her and her actions.`;
  if (targetBase === "bn") {
    genderRules += `
- Write in Bengali (Bangla) script. Use correct gendered verb forms (e.g. করেছে vs করেছেন where context requires).`;
  }
    if (speaker?.gender === "female") {
      genderRules += `\n- This line is from or primarily about ${speaker.name} (female): use feminine verb endings and pronouns for ${speaker.name}.`;
    } else if (speaker?.gender === "male") {
      genderRules += `\n- This line is from or primarily about ${speaker.name} (male): use masculine verb endings and pronouns for ${speaker.name}.`;
    } else if (speaker?.name) {
      genderRules += `\n- Current speaker label: ${speaker.name}. Infer gender from context; prefer feminine forms when the text implies wife/she/her.`;
    }
    if (roster.length) {
      genderRules += "\nKnown participants (use for agreement when these names appear):";
      roster.forEach((entry) => {
        genderRules += `\n- ${entry.name}: ${entry.gender}`;
      });
    }
  }

  return `${sourceHint}Translate meeting transcript text into ${targetLanguage}. Preserve speaker names, numbers, dates, and product names. Return only the translated text with no commentary. If the text is already in ${targetLanguage}, return it unchanged.${genderRules}`;
}
