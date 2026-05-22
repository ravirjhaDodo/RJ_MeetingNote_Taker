import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  getDocs,
  getFirestore,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

const config = window.RJ_FIREBASE_CONFIG;
const hasConfig = Boolean(config?.apiKey && config?.projectId && !config.apiKey.startsWith("your-"));

let auth = null;
let db = null;
let saveMeetingCall = null;
let askMeetingCall = null;
let currentUser = null;

function emitAuthChange() {
  window.dispatchEvent(new CustomEvent("rj-cloud-auth", {
    detail: { ready: hasConfig, user: currentUser },
  }));
}

if (hasConfig) {
  const app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  const functions = getFunctions(app, "us-central1");

  if (window.RJ_USE_FIREBASE_EMULATORS) {
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }

  saveMeetingCall = httpsCallable(functions, "saveMeeting");
  askMeetingCall = httpsCallable(functions, "askMeeting");

  onAuthStateChanged(auth, (user) => {
    currentUser = user ? {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
    } : null;
    emitAuthChange();
  });
} else {
  queueMicrotask(emitAuthChange);
}

async function signIn() {
  if (!auth) throw new Error("Firebase client config is missing.");
  await signInWithPopup(auth, new GoogleAuthProvider());
}

async function logOut() {
  if (!auth) return;
  await signOut(auth);
}

function requireUser() {
  if (!currentUser) throw new Error("Sign in before using cloud features.");
  return currentUser;
}

async function saveMeeting({ title, segments }) {
  requireUser();
  if (!saveMeetingCall) throw new Error("Firebase Functions are not configured.");
  const response = await saveMeetingCall({ title, segments });
  return response.data;
}

async function askMeeting({ question, meetingId }) {
  requireUser();
  if (!askMeetingCall) throw new Error("Firebase Functions are not configured.");
  const response = await askMeetingCall({ question, meetingId });
  return response.data;
}

async function listMeetings() {
  const user = requireUser();
  const meetingsRef = collection(db, "users", user.uid, "meetings");
  const snapshot = await getDocs(query(meetingsRef, orderBy("updatedAt", "desc")));
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

window.RJCloud = {
  ready: hasConfig,
  get user() {
    return currentUser;
  },
  signIn,
  signOut: logOut,
  saveMeeting,
  askMeeting,
  listMeetings,
};

window.dispatchEvent(new CustomEvent("rj-cloud-ready", {
  detail: { ready: hasConfig },
}));
