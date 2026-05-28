/**
 * Start Firebase emulators with Java on PATH (Firestore emulator requires JDK).
 * Auto-detects common JDK installs when JAVA_HOME is unset.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function dirHasJava(dir) {
  if (!dir) return false;
  const bin = path.join(dir, "bin", process.platform === "win32" ? "java.exe" : "java");
  return fs.existsSync(bin);
}

function newestMatchingDir(parent, prefix) {
  if (!fs.existsSync(parent)) return null;
  const matches = fs
    .readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.toLowerCase().startsWith(prefix.toLowerCase()))
    .map((entry) => path.join(parent, entry.name))
    .filter(dirHasJava)
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return matches[0] || null;
}

function detectJavaHome() {
  if (dirHasJava(process.env.JAVA_HOME)) return process.env.JAVA_HOME;

  if (process.platform === "win32") {
    const winCandidates = [
      newestMatchingDir("C:\\Program Files\\Microsoft", "jdk-"),
      newestMatchingDir("C:\\Program Files\\Eclipse Adoptium", "jdk-"),
      newestMatchingDir("C:\\Program Files\\Java", "jdk-"),
      newestMatchingDir("C:\\Program Files\\Java", "jre-"),
    ].filter(Boolean);
    if (winCandidates[0]) return winCandidates[0];
  }

  if (process.platform === "darwin") {
    const macCandidates = [
      "/Library/Java/JavaVirtualMachines",
    ];
    for (const parent of macCandidates) {
      const hit = newestMatchingDir(parent, "");
      if (hit) {
        const home = path.join(hit, "Contents", "Home");
        if (dirHasJava(home)) return home;
        if (dirHasJava(hit)) return hit;
      }
    }
  }

  return null;
}

function usage() {
  console.error("Usage: node scripts/run-emulators.js [firebase args...]");
  console.error("Example: node scripts/run-emulators.js emulators:start --only hosting,functions,firestore,auth");
  process.exit(1);
}

const firebaseArgs = process.argv.slice(2);
if (!firebaseArgs.length) usage();

const javaHome = detectJavaHome();
if (!javaHome) {
  console.error(
    "Java (JDK 11+) is required for the Firestore emulator but was not found.\n"
    + "Install Microsoft OpenJDK or Temurin, then set JAVA_HOME or add java to PATH.\n"
    + "https://learn.microsoft.com/en-us/java/openjdk/download",
  );
  process.exit(1);
}

const javaBin = path.join(javaHome, "bin");
const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  PATH: `${javaBin}${path.delimiter}${process.env.PATH || ""}`,
};

console.log(`Using Java: ${javaHome}`);

const child = spawn("npx", ["firebase", ...firebaseArgs], {
  env,
  stdio: "inherit",
  shell: true,
  cwd: path.join(__dirname, ".."),
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error.message || error);
  process.exit(1);
});
