/**
 * Set password for a UserID account.
 * Usage (from repo root): node functions/scripts/set-user-password.js <userId> <password>
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import {
  defaultFeaturesForNewUser,
  internalAuthEmail,
  normalizeUserId,
  PLATFORM_ADMIN_EMAIL,
  rolesForPrimaryRole,
} from "../lib/rj-shared.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) return null;
  const text = readFileSync(envPath, "utf8");
  const line = text.split("\n").find((l) => l.startsWith("FIREBASE_SERVICE_ACCOUNT_JSON="));
  if (!line) return null;
  let raw = line.slice("FIREBASE_SERVICE_ACCOUNT_JSON=".length).trim();
  if (raw.startsWith("{")) return JSON.parse(raw);
  return null;
}

const userId = normalizeUserId(process.argv[2]);
const password = process.argv[3];

if (!userId || !password) {
  console.error("Usage: node functions/scripts/set-user-password.js <userId> <password>");
  process.exit(1);
}

const useAuthEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const serviceAccount = loadServiceAccount();

if (useAuthEmulator) {
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || "rj-meeting-notes-taker" });
} else if (serviceAccount) {
  initializeApp({ credential: cert(serviceAccount) });
} else {
  console.error("FIREBASE_SERVICE_ACCOUNT_JSON not found. For local emulator, set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099");
  process.exit(1);
}
const auth = getAuth();
const db = getFirestore();
const authEmail = internalAuthEmail(userId);

async function ensureOwnerProfile(uid) {
  const features = defaultFeaturesForNewUser({ isPlatformAdmin: true });
  const batch = db.batch();
  batch.set(db.collection("userIds").doc(userId), {
    uid,
    contactEmail: PLATFORM_ADMIN_EMAIL,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(db.collection("users").doc(uid), {
    userId,
    email: authEmail,
    contactEmail: PLATFORM_ADMIN_EMAIL,
    firstName: "Ravi",
    lastName: "Jha",
    displayName: "Ravi Jha",
    photoURL: "",
    preferredLanguage: "en",
    role: "admin",
    roles: rolesForPrimaryRole("admin"),
    status: "active",
    plan: "free",
    platformApiAccess: "admin",
    trialEndsAt: null,
    aiNotesTrialEndsAt: features.aiNotesTrialEndsAt,
    features: features.features,
    guestApiAccess: false,
    guestApiExpiresAt: null,
    subscriptionStatus: "none",
    requiresPasswordChange: false,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();
}

async function main() {
  let uid = null;
  let created = false;

  try {
    uid = (await auth.getUserByEmail(authEmail)).uid;
    await auth.updateUser(uid, { password });
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      throw error;
    }
    const user = await auth.createUser({
      email: authEmail,
      password,
      displayName: "Ravi Jha",
    });
    uid = user.uid;
    created = true;
  }

  try {
    await ensureOwnerProfile(uid);
  } catch (firestoreError) {
    console.warn("Firestore profile/registry update skipped:", firestoreError.message);
  }

  const action = created ? "Created admin account" : "Password updated";
  console.log(`${action} for UserID "${userId}". Log in at login.html with UserID and password.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
