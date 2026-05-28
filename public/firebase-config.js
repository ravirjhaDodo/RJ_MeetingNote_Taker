// Public Firebase web config (safe to commit; secured by Firestore rules + Auth, not secrecy).
// firebase-config.local.js (gitignored) loads after this file and overrides for local emulator dev.
window.RJ_FIREBASE_CONFIG = window.RJ_FIREBASE_CONFIG || {
  apiKey: "AIzaSyAzE7X_HrTGhioDJUv5bUrd24f7AcCeZ1o",
  authDomain: "rj-meeting-notes-taker.firebaseapp.com",
  projectId: "rj-meeting-notes-taker",
  storageBucket: "rj-meeting-notes-taker.firebasestorage.app",
  messagingSenderId: "962274015728",
  appId: "1:962274015728:web:23f4481f61a8b390b50535"
};
window.RJ_USE_FIREBASE_EMULATORS = window.RJ_USE_FIREBASE_EMULATORS || false;
window.RJ_BACKEND_MODE = window.RJ_BACKEND_MODE || "vercel";
window.RJ_API_BASE_URL = window.RJ_API_BASE_URL || "/api/rj";
