/**
 * Set password for a UserID account.
 * Usage: node scripts/set-user-password.js <userId> <password>
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
  return JSON.parse(raw.replace(/\\n/g, "\n"));
}

const userId = normalizeUserId(process.argv[2]);
const password = process.argv[3];

if (!userId || !password) {
  console.error("Usage: node scripts/set-user-password.js <userId> <password>");
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
  let uid = null;
  const registry = await db.collection("userIds").doc(userId).get();
  if (registry.exists) {
    uid = registry.data().uid;
  }

  if (!uid) {
    try {
      const user = await auth.getUserByEmail(authEmail);
      uid = user.uid;
    } catch {
      console.error(`No account found for UserID "${userId}" (${authEmail}). Run seed or signup first.`);
      process.exit(1);
    }
  }

  await auth.updateUser(uid, { password });
  await db.collection("users").doc(uid).set({
    requiresPasswordChange: false,
    updatedAt: new Date(),
  }, { merge: true });

  console.log(`Password updated for UserID "${userId}" (uid ${uid}).`);
  console.log(`Log in at login.html with UserID: ${userId}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
