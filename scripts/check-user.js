/**
 * Inspect whether a UserID exists (Auth + Firestore registry/profile).
 * Usage: node scripts/check-user.js <userId>
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON in environment (or .env.local).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { internalAuthEmail, normalizeUserId } from "../functions/lib/rj-shared.js";

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

const userId = normalizeUserId(process.argv[2]);
if (!userId) {
  console.error("Usage: node scripts/check-user.js <userId>");
  process.exit(1);
}

const serviceAccount = loadServiceAccount();
if (!serviceAccount) {
  console.error("FIREBASE_SERVICE_ACCOUNT_JSON not found in env or .env.local");
  process.exit(1);
}

const app = initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const db = getFirestore(app);
const authEmail = internalAuthEmail(userId);

async function main() {
  console.log(`Project: ${serviceAccount.project_id}`);
  console.log(`UserID: ${userId}  authEmail: ${authEmail}`);

  const registry = await db.collection("userIds").doc(userId).get();
  console.log(`Firestore userIds/${userId} exists: ${registry.exists}` + (registry.exists ? ` (uid=${registry.data().uid})` : ""));

  try {
    const user = await auth.getUserByEmail(authEmail);
    console.log(`Auth user EXISTS: uid=${user.uid}, disabled=${user.disabled}, created=${user.metadata.creationTime}`);
    const profile = await db.collection("users").doc(user.uid).get();
    console.log(`Firestore users/${user.uid} exists: ${profile.exists}` + (profile.exists ? ` (status=${profile.data().status})` : ""));
  } catch (error) {
    console.log(`Auth user NOT FOUND for ${authEmail} (${error.code || error.message})`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
