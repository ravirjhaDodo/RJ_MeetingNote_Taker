// Copy to firebase-config.local.js (gitignored). See docs/firebase-setup.md and CODEX.md.
window.RJ_FIREBASE_CONFIG = {
  apiKey: "your-web-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000"
};

window.RJ_USE_FIREBASE_EMULATORS = false;
window.RJ_BACKEND_MODE = "vercel";
window.RJ_API_BASE_URL = "/api/rj";
