/**
 * One-time bootstrap for platform owner (ravirjha).
 * Usage: node scripts/seed-platform-owner.js
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON in environment.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  defaultFeaturesForNewUser,
  internalAuthEmail,
  PLATFORM_ADMIN_EMAIL,
  PLATFORM_OWNER_USER_ID,
} from "../functions/lib/rj-shared.js";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error("Set FIREBASE_SERVICE_ACCOUNT_JSON before running.");
  process.exit(1);
}

const app = initializeApp({ credential: cert(JSON.parse(raw)) });
const auth = getAuth(app);
const db = getFirestore(app);

const userId = PLATFORM_OWNER_USER_ID;
const contactEmail = PLATFORM_ADMIN_EMAIL;
const authEmail = internalAuthEmail(userId);
const password = process.env.OWNER_SEED_PASSWORD || "RaviOwner!2026";

async function main() {
  const registryRef = db.collection("userIds").doc(userId);
  const existing = await registryRef.get();
  if (existing.exists) {
    console.log("Owner UserID registry already exists.");
    process.exit(0);
  }

  const user = await auth.createUser({
    email: authEmail,
    password,
    displayName: "Ravi Jha",
  });

  const features = defaultFeaturesForNewUser({ isPlatformAdmin: true });
  const batch = db.batch();
  batch.set(registryRef, {
    uid: user.uid,
    contactEmail,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection("users").doc(user.uid), {
    userId,
    email: authEmail,
    contactEmail,
    firstName: "Ravi",
    lastName: "Jha",
    displayName: "Ravi Jha",
    photoURL: "",
    preferredLanguage: "en",
    role: "admin",
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
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  console.log(`Owner seeded: UserID=${userId}, uid=${user.uid}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
