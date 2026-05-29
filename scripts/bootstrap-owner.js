/**
 * Repair/bootstrap the platform owner on an EXISTING Auth user:
 * reset password and (re)create the userIds registry + full admin profile.
 * Usage: node scripts/bootstrap-owner.js [password]
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON in environment (or .env.local).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  defaultFeaturesForNewUser,
  internalAuthEmail,
  PLATFORM_ADMIN_EMAIL,
  PLATFORM_OWNER_USER_ID,
  rolesForPrimaryRole,
} from "../functions/lib/rj-shared.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) return null;
  const text = readFileSync(envPath, "utf8");
  const match = text.match(/FIREBASE_SERVICE_ACCOUNT_JSON=(.+)/);
  if (!match) return null;
  let raw = match[1].trim();
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    raw = raw.slice(1, -1);
  }
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(raw.replace(/\\n/g, "\n"));
  }
}

const serviceAccount = loadServiceAccount();
if (!serviceAccount) {
  console.error("FIREBASE_SERVICE_ACCOUNT_JSON not found in env or .env.local");
  process.exit(1);
}

const password = process.argv[2] || process.env.OWNER_SEED_PASSWORD || "Ravi@123";
const app = initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const db = getFirestore(app);
const userId = PLATFORM_OWNER_USER_ID;
const authEmail = internalAuthEmail(userId);

async function main() {
  const user = await auth.getUserByEmail(authEmail);
  await auth.updateUser(user.uid, { password });

  const features = defaultFeaturesForNewUser({ isPlatformAdmin: true });
  const registryRef = db.collection("userIds").doc(userId);
  const profileRef = db.collection("users").doc(user.uid);

  await registryRef.set({
    uid: user.uid,
    contactEmail: PLATFORM_ADMIN_EMAIL,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await profileRef.set({
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
    requiresPasswordChange: false,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`Owner "${userId}" (uid ${user.uid}) bootstrapped: password reset, registry + admin profile ensured.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
