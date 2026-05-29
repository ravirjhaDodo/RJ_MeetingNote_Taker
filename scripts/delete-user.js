/**
 * Delete a UserID account (Auth user + Firestore registry/profile + subcollections).
 * Usage: node scripts/delete-user.js <userId>
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
  // Properly-escaped single-line JSON parses as-is; only fall back to unescaping
  // newlines if the direct parse fails (handles both storage styles).
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(raw.replace(/\\n/g, "\n"));
  }
}

const userId = normalizeUserId(process.argv[2]);
if (!userId) {
  console.error("Usage: node scripts/delete-user.js <userId>");
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
  const registryRef = db.collection("userIds").doc(userId);
  const registry = await registryRef.get();
  if (registry.exists) uid = registry.data().uid;

  if (!uid) {
    try {
      const user = await auth.getUserByEmail(authEmail);
      uid = user.uid;
    } catch {
      uid = null;
    }
  }

  if (!uid && !registry.exists) {
    console.error(`No account found for UserID "${userId}" (${authEmail}). Nothing to delete.`);
    process.exit(1);
  }

  if (uid) {
    try {
      await auth.deleteUser(uid);
      console.log(`Deleted Auth user uid=${uid}`);
    } catch (error) {
      console.warn(`Auth user delete skipped: ${error.message || error}`);
    }
    await db.recursiveDelete(db.collection("users").doc(uid));
    console.log(`Deleted Firestore users/${uid} (and subcollections)`);
  }

  if (registry.exists) {
    await registryRef.delete();
    console.log(`Deleted Firestore userIds/${userId}`);
  }

  console.log(`Account "${userId}" deleted. You can sign it up again.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
