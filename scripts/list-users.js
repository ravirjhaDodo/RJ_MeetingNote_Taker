/**
 * List all user profiles (userId, name, contact email, role, status).
 * Flags any non-owner account that holds admin role.
 * Usage: node scripts/list-users.js
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON in environment (or .env.local).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { PLATFORM_OWNER_USER_ID, isProfileAdmin } from "../functions/lib/rj-shared.js";

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

const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

async function main() {
  console.log(`Project: ${serviceAccount.project_id}\n`);
  const snap = await db.collection("users").get();
  const rows = [];
  snap.forEach((doc) => {
    const d = doc.data();
    rows.push({
      uid: doc.id,
      userId: d.userId || "",
      name: d.displayName || `${d.firstName || ""} ${d.lastName || ""}`.trim(),
      contactEmail: d.contactEmail || d.email || "",
      role: isProfileAdmin(d) ? "admin" : (d.role || "user"),
      status: d.status || "",
    });
  });
  rows.sort((a, b) => a.userId.localeCompare(b.userId));
  for (const r of rows) {
    const flag = r.role === "admin" && r.userId !== PLATFORM_OWNER_USER_ID ? "  <-- NON-OWNER ADMIN" : "";
    console.log(`${r.userId.padEnd(16)} | ${r.role.padEnd(5)} | ${r.status.padEnd(8)} | ${r.contactEmail.padEnd(28)} | ${r.name}${flag}`);
    console.log(`  uid=${r.uid}`);
  }
  console.log(`\nTotal: ${rows.length} users`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
