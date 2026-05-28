/**
 * Seed a local dev account into Firebase Auth + Firestore emulators.
 * Usage: npm run seed:emulator
 *        npm run seed:emulator -- otheruser "TheirPass123"
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const userId = process.argv[2] || "ravirjha";
const password = process.argv[3] || "Ravi@123";

const env = {
  ...process.env,
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  GCLOUD_PROJECT: process.env.GCLOUD_PROJECT || "rj-meeting-notes-taker",
};

console.log(`Seeding emulator user "${userId}" (Auth @ ${env.FIREBASE_AUTH_EMULATOR_HOST})...`);

const child = spawn(
  process.execPath,
  [path.join(root, "functions/scripts/set-user-password.js"), userId, password],
  { env, stdio: "inherit", cwd: root },
);

child.on("exit", (code) => {
  if (code === 0) {
    console.log(`\nLog in at http://127.0.0.1:5180/login.html`);
    console.log(`  UserID: ${userId}`);
    console.log(`  Password: (the value you passed)`);
  }
  process.exit(code ?? 1);
});
