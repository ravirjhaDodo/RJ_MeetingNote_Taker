/**
 * Set arbitrary string profile fields on a user.
 * Usage: node scripts/set-profile.js <userId> key=value [key=value ...]
 * Use key= (empty) to clear a field.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { internalAuthEmail, normalizeUserId } from "../functions/lib/rj-shared.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) return null;
  const match = readFileSync(envPath, "utf8").match(/FIREBASE_SERVICE_ACCOUNT_JSON=(.+)/);
  if (!match) return null;
  let raw = match[1].trim();
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) raw = raw.slice(1, -1);
  try { return JSON.parse(raw); } catch { return JSON.parse(raw.replace(/\\n/g, "\n")); }
}

const userId = normalizeUserId(process.argv[2]);
const pairs = process.argv.slice(3);
if (!userId || pairs.length === 0) {
  console.error("Usage: node scripts/set-profile.js <userId> key=value [key=value ...]");
  process.exit(1);
}

const updates = { updatedAt: FieldValue.serverTimestamp() };
for (const p of pairs) {
  const idx = p.indexOf("=");
  if (idx === -1) continue;
  updates[p.slice(0, idx)] = p.slice(idx + 1);
}

const serviceAccount = loadServiceAccount();
const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

async function main() {
  const user = await getAuth(app).getUserByEmail(internalAuthEmail(userId));
  await db.collection("users").doc(user.uid).set(updates, { merge: true });
  console.log(`Updated ${userId} (uid=${user.uid}):`, JSON.stringify(updates));
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
