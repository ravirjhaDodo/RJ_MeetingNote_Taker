const AUTH_API = window.RJ_API_BASE_URL || "/api/rj";
const INTERNAL_AUTH_DOMAIN = "accounts.rj-meeting-notes-taker.app";
const RESERVED_USER_IDS = new Set(["admin", "root", "support", "system", "api", "help"]);

export function normalizeUserId(raw) {
  return String(raw ?? "").trim().toLowerCase();
}

export function validateUserId(userId) {
  const normalized = normalizeUserId(userId);
  if (!normalized) return { ok: false, error: "UserID is required." };
  if (normalized.length < 3 || normalized.length > 24) {
    return { ok: false, error: "UserID must be 3–24 characters." };
  }
  if (!/^[a-z][a-z0-9_]*$/.test(normalized)) {
    return { ok: false, error: "UserID must start with a letter and use only letters, numbers, and underscore." };
  }
  if (RESERVED_USER_IDS.has(normalized)) {
    return { ok: false, error: "This UserID is reserved." };
  }
  return { ok: true, userId: normalized };
}

export function internalAuthEmail(userId) {
  const validated = validateUserId(userId);
  if (!validated.ok) throw new Error(validated.error);
  return `${validated.userId}@${INTERNAL_AUTH_DOMAIN}`;
}

export function formatAuthError(error) {
  const code = String(error?.code || "");
  const usingEmulators = Boolean(window.RJ_USE_FIREBASE_EMULATORS);
  const emulatorHint = usingEmulators
    ? " Start emulators (npm run serve), then run: npm run seed:emulator"
    : "";

  const messages = {
    "auth/user-not-found": `No account for this UserID.${emulatorHint}`,
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": `UserID or password is incorrect.${emulatorHint}`,
    "auth/invalid-email": "Invalid UserID format.",
    "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
    "auth/network-request-failed": "Network error. Check that emulators or Firebase are running.",
  };
  if (messages[code]) return messages[code];
  const raw = String(error?.message || "Login failed.");
  if (raw.includes("Firebase is not configured")) return raw;
  if (raw.includes("auth/")) return raw.replace(/^Firebase:\s*/i, "").replace(/Error\s*\([^)]+\)\.?\s*/i, "");
  return raw;
}

export async function publicApi(action, data = {}) {
  if (window.RJCloud?.publicAction) {
    return window.RJCloud.publicAction(action, data);
  }
  const response = await fetch(AUTH_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `${action} failed.`);
  return payload;
}

export function wirePasswordToggles(root = document) {
  root.querySelectorAll(".password-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const input = root.querySelector(`#${button.dataset.passwordTarget}`);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });
}

export function debounce(fn, wait = 400) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export async function checkUserIdAvailability(userId) {
  return publicApi("checkUserIdAvailability", { userId });
}

export async function registerAccount(payload) {
  return publicApi("registerAccount", payload);
}

export async function requestPasswordReset(userId) {
  return publicApi("requestPasswordReset", { userId });
}

export async function requestUserIdReminder(contactEmail) {
  return publicApi("requestUserIdReminder", { contactEmail });
}

export async function signInWithUserId(userId, password) {
  if (!window.RJCloud?.ready) {
    throw new Error("Firebase is not configured. Add public/firebase-config.local.js for local login.");
  }
  if (!window.RJCloud?.signInWithEmail) {
    throw new Error("Firebase is not configured.");
  }
  const validated = validateUserId(userId);
  if (!validated.ok) throw new Error(validated.error);
  if (!String(password || "").length) throw new Error("Password is required.");
  try {
    await window.RJCloud.signInWithEmail(internalAuthEmail(validated.userId), password);
  } catch (error) {
    throw new Error(formatAuthError(error));
  }
}
