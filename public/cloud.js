import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  connectAuthEmulator,
  getAuth,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

const config = window.RJ_FIREBASE_CONFIG;
const hasConfig = Boolean(config?.apiKey && config?.projectId && !config.apiKey.startsWith("your-"));

let auth = null;
let storage = null;
let saveMeetingCall = null;
let askMeetingCall = null;
let listMeetingsCall = null;
let getMeetingCall = null;
let ensureUserProfileCall = null;
let updateUserProfileCall = null;
let listUsersCall = null;
let adminUpdateUserCall = null;
let adminGenerateTemporaryPasswordCall = null;
let saveUserApiKeyCall = null;
let listUserApiKeysCall = null;
let deleteUserApiKeyCall = null;
let translateTranscriptCall = null;
let generateMeetingNotesCall = null;
let getAssemblyAiStreamingTokenCall = null;
let transcribeAudioChunkCall = null;
let inferSpeakerNamesCall = null;
let checkUserIdAvailabilityCall = null;
let registerAccountCall = null;
let requestPasswordResetCall = null;
let requestUserIdReminderCall = null;
let currentUser = null;
let currentProfile = null;
let hasAssemblyAiKeyCached = false;
const backendMode = window.RJ_BACKEND_MODE || "vercel";
const apiEndpoint = window.RJ_API_BASE_URL || "/api/rj";
const usingEmulators = Boolean(window.RJ_USE_FIREBASE_EMULATORS);

function localBackendHint() {
  if (backendMode !== "vercel") return "";
  if (apiEndpoint.startsWith("http")) return "";
  if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
    return " Run npm run vercel:dev for /api/rj locally, or set RJ_BACKEND_MODE = \"firebase\" for Firebase emulators.";
  }
  return "";
}

function emitAuthChange() {
  window.dispatchEvent(new CustomEvent("rj-cloud-auth", {
    detail: { ready: hasConfig, user: currentUser, profile: currentProfile },
  }));
}

if (hasConfig) {
  const app = initializeApp(config);
  auth = getAuth(app);
  storage = getStorage(app);
  const functions = getFunctions(app, "us-central1");

  if (window.RJ_USE_FIREBASE_EMULATORS) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }

  saveMeetingCall = httpsCallable(functions, "saveMeeting");
  askMeetingCall = httpsCallable(functions, "askMeeting");
  listMeetingsCall = httpsCallable(functions, "listMeetings");
  getMeetingCall = httpsCallable(functions, "getMeeting");
  ensureUserProfileCall = httpsCallable(functions, "ensureUserProfile");
  updateUserProfileCall = httpsCallable(functions, "updateUserProfile");
  listUsersCall = httpsCallable(functions, "listUsers");
  adminUpdateUserCall = httpsCallable(functions, "adminUpdateUser");
  adminGenerateTemporaryPasswordCall = httpsCallable(functions, "adminGenerateTemporaryPassword");
  saveUserApiKeyCall = httpsCallable(functions, "saveUserApiKey");
  listUserApiKeysCall = httpsCallable(functions, "listUserApiKeys");
  deleteUserApiKeyCall = httpsCallable(functions, "deleteUserApiKey");
  translateTranscriptCall = httpsCallable(functions, "translateTranscript", { timeout: 120000 });
  generateMeetingNotesCall = httpsCallable(functions, "generateMeetingNotes");
  getAssemblyAiStreamingTokenCall = httpsCallable(functions, "getAssemblyAiStreamingToken");
  transcribeAudioChunkCall = httpsCallable(functions, "transcribeAudioChunk", { timeout: 300000 });
  inferSpeakerNamesCall = httpsCallable(functions, "inferSpeakerNames");
  checkUserIdAvailabilityCall = httpsCallable(functions, "checkUserIdAvailability");
  registerAccountCall = httpsCallable(functions, "registerAccount");
  requestPasswordResetCall = httpsCallable(functions, "requestPasswordReset");
  requestUserIdReminderCall = httpsCallable(functions, "requestUserIdReminder");

  onAuthStateChanged(auth, async (user) => {
    currentUser = user ? {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
    } : null;
    currentProfile = null;
    if (currentUser) {
      try {
        const response = await callBackend("ensureUserProfile", {}, ensureUserProfileCall);
        currentProfile = response.profile;
        await refreshAssemblyAiKeyStatus();
      } catch (error) {
        window.dispatchEvent(new CustomEvent("rj-cloud-error", {
          detail: { message: error.message || "Could not load user profile." },
        }));
      }
    }
    emitAuthChange();
  });

  getRedirectResult(auth).catch((error) => {
    window.dispatchEvent(new CustomEvent("rj-cloud-error", {
      detail: { message: error.message || "Google sign-in redirect failed." },
    }));
  });
} else {
  queueMicrotask(emitAuthChange);
}

async function signIn() {
  if (!auth) throw new Error("Firebase client config is missing.");
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error.code === "auth/popup-blocked" || error.code === "auth/cancelled-popup-request") {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw error;
  }
}

async function signInWithEmail(email, password) {
  if (!auth) throw new Error("Firebase client config is missing.");
  await signInWithEmailAndPassword(auth, email, password);
}

async function signUpWithEmail(email, password) {
  if (!auth) throw new Error("Firebase client config is missing.");
  await createUserWithEmailAndPassword(auth, email, password);
}

async function resetPassword(email) {
  if (!auth) throw new Error("Firebase client config is missing.");
  await sendPasswordResetEmail(auth, email);
}

async function magicLink(email) {
  if (!auth) throw new Error("Firebase client config is missing.");
  await sendSignInLinkToEmail(auth, email, {
    url: window.location.origin,
    handleCodeInApp: true,
  });
  window.localStorage.setItem("rjMagicEmail", email);
}

async function changePassword(newPassword) {
  requireUser();
  await updatePassword(auth.currentUser, newPassword);
}

async function logOut() {
  if (!auth) return;
  await signOut(auth);
}

function requireUser() {
  if (!currentUser) throw new Error("Sign in before using cloud features.");
  return currentUser;
}

async function publicAction(action, data = {}) {
  if (backendMode === "firebase") {
    const callables = {
      checkUserIdAvailability: checkUserIdAvailabilityCall,
      registerAccount: registerAccountCall,
      requestPasswordReset: requestPasswordResetCall,
      requestUserIdReminder: requestUserIdReminderCall,
    };
    const callable = callables[action];
    if (!callable) throw new Error(`Unknown public action: ${action}`);
    const response = await callable(data);
    return response.data;
  }

  const response = await fetch(apiEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `${action} failed.`);
  }
  return payload;
}

async function callApi(action, data = {}) {
  requireUser();
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(apiEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, data }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const hint = response.status === 404 ? localBackendHint() : "";
    throw new Error((payload.error || `${action} failed.`) + hint);
  }
  return payload;
}

async function callBackend(action, data, callable) {
  if (backendMode !== "firebase") {
    return callApi(action, data);
  }
  if (!callable) throw new Error("Firebase Functions are not configured.");
  const response = await callable(data);
  return response.data;
}

async function saveMeeting({ title, segments, meetingId, generatedNotes }) {
  requireUser();
  return callBackend("saveMeeting", { title, segments, meetingId, generatedNotes }, saveMeetingCall);
}

async function askMeeting({ question, meetingId }) {
  requireUser();
  return callBackend("askMeeting", { question, meetingId }, askMeetingCall);
}

async function listMeetings() {
  requireUser();
  const response = await callBackend("listMeetings", {}, listMeetingsCall);
  return response.meetings || [];
}

async function getMeeting(meetingId) {
  requireUser();
  return callBackend("getMeeting", { meetingId }, getMeetingCall);
}

async function updateProfile(data) {
  requireUser();
  const response = await callBackend("updateUserProfile", data, updateUserProfileCall);
  currentProfile = response.profile;
  emitAuthChange();
  return currentProfile;
}

async function uploadAvatar(file) {
  const user = requireUser();
  if (!storage) throw new Error("Firebase Storage is not configured.");
  const path = `avatars/${user.uid}/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

async function listUsers() {
  requireUser();
  const response = await callBackend("listUsers", {}, listUsersCall);
  return response.users || [];
}

async function adminUpdateUser(data) {
  requireUser();
  return callBackend("adminUpdateUser", data, adminUpdateUserCall);
}

async function adminGenerateTemporaryPassword(uid) {
  requireUser();
  return callBackend("adminGenerateTemporaryPassword", { uid }, adminGenerateTemporaryPasswordCall);
}

async function saveUserApiKey(data) {
  requireUser();
  return callBackend("saveUserApiKey", data, saveUserApiKeyCall);
}

async function listUserApiKeys() {
  requireUser();
  const response = await callBackend("listUserApiKeys", {}, listUserApiKeysCall);
  return response.keys || [];
}

async function deleteUserApiKey(keyId) {
  requireUser();
  return callBackend("deleteUserApiKey", { keyId }, deleteUserApiKeyCall);
}

async function translateTranscript({
  text,
  targetLanguage = "en",
  sourceLanguage = "",
  speakerContext = null,
  meetingSpeakers = [],
}) {
  requireUser();
  return callBackend(
    "translateTranscript",
    { text, targetLanguage, sourceLanguage, speakerContext, meetingSpeakers },
    translateTranscriptCall,
  );
}

async function generateMeetingNotes(payload) {
  requireUser();
  return callBackend("generateMeetingNotes", payload, generateMeetingNotesCall);
}

async function getAssemblyAiStreamingToken() {
  requireUser();
  return callBackend("getAssemblyAiStreamingToken", {}, getAssemblyAiStreamingTokenCall);
}

async function transcribeAudioChunk(payload) {
  requireUser();
  return callBackend("transcribeAudioChunk", payload, transcribeAudioChunkCall);
}

async function inferSpeakerNames(payload) {
  requireUser();
  return callBackend("inferSpeakerNames", payload, inferSpeakerNamesCall);
}

async function refreshAssemblyAiKeyStatus() {
  if (!currentUser) {
    hasAssemblyAiKeyCached = false;
    return false;
  }
  try {
    const keys = await listUserApiKeys();
    hasAssemblyAiKeyCached = keys.some((key) => key.provider === "assemblyai");
  } catch {
    hasAssemblyAiKeyCached = false;
  }
  return hasAssemblyAiKeyCached;
}

function profileIsAdmin(profile) {
  if (!profile) return false;
  if (Array.isArray(profile.roles) && profile.roles.includes("admin")) return true;
  return profile.role === "admin";
}

function hasAssemblyAiAccess() {
  const profile = currentProfile;
  if (!profile) return false;
  if (profileIsAdmin(profile)) return true;
  if (canUseFeature("speakerDiarization")) return true;
  if (hasAssemblyAiKeyCached) return true;
  return false;
}

function canUseFeature(featureKey) {
  const profile = currentProfile;
  if (!profile) return false;
  if (profileIsAdmin(profile)) return true;
  if (profile.status !== "active") return false;
  const feature = profile.features?.[featureKey];
  if (!feature || feature.status === "paused" || feature.status === "expired") return false;
  if (feature.expiresAt && new Date(feature.expiresAt) < new Date()) return false;
  if (featureKey === "aiMeetingNotes" && feature.source === "trial") {
    const trialEnd = profile.aiNotesTrialEndsAt ? new Date(profile.aiNotesTrialEndsAt) : null;
    if (trialEnd && trialEnd < new Date()) return false;
  }
  return true;
}

function canUsePanelTranslation() {
  return canUseFeature("autoTranslate") || canUseFeature("aiMeetingNotes");
}

window.RJCloud = {
  ready: hasConfig,
  get backendMode() {
    return backendMode;
  },
  get usingEmulators() {
    return usingEmulators;
  },
  get user() {
    return currentUser;
  },
  get profile() {
    return currentProfile;
  },
  signIn,
  signInWithEmail,
  signUpWithEmail,
  resetPassword,
  magicLink,
  changePassword,
  signOut: logOut,
  saveMeeting,
  askMeeting,
  listMeetings,
  getMeeting,
  updateProfile,
  uploadAvatar,
  listUsers,
  adminUpdateUser,
  adminGenerateTemporaryPassword,
  saveUserApiKey,
  listUserApiKeys,
  deleteUserApiKey,
  translateTranscript,
  generateMeetingNotes,
  getAssemblyAiStreamingToken,
  transcribeAudioChunk,
  inferSpeakerNames,
  hasAssemblyAiAccess,
  refreshAssemblyAiKeyStatus,
  canUseFeature,
  canUsePanelTranslation,
  publicAction,
};

window.dispatchEvent(new CustomEvent("rj-cloud-ready", {
  detail: { ready: hasConfig },
}));
