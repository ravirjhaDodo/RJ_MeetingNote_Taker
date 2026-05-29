/**
 * Set a user's role (admin|user).
 * Usage: node scripts/set-role.js <userId> <admin|user>
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON in environment (or .env.local).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { internalAuthEmail, normalizeUserId, rolesForPrimaryRole } from "../functions/lib/rj-shared.js";

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
const role = process.argv[3];
if (!userId || !["admin", "user"].includes(role)) {
  console.error("Usage: node scripts/set-role.js <userId> <admin|user>");
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

async function main() {
  const user = await auth.getUserByEmail(internalAuthEmail(userId));
  await db.collection("users").doc(user.uid).set({
    role,
    roles: rolesForPrimaryRole(role),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`Set ${userId} (uid=${user.uid}) role -> ${role}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
