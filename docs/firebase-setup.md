# Firebase Setup

This project uses Firebase for:

- Google sign-in with Firebase Auth.
- Firestore meeting metadata and transcript segments.
- Firebase Functions for `saveMeeting` and `askMeeting`.
- Optional Firebase Hosting.

## 1. Create Firebase Project

1. Open <https://console.firebase.google.com/>.
2. Select **Add project**.
3. Project name:

```text
RJ Meeting Notes Taker
```

4. Suggested project id:

```text
rj-meeting-notes-taker
```

5. Google Analytics can be disabled for this prototype.

## 2. Enable Authentication

1. Go to **Build > Authentication**.
2. Select **Get started**.
3. Open **Sign-in method**.
4. Enable **Google**.
5. Set a support email.
6. Save.

## 3. Create Firestore Database

1. Go to **Build > Firestore Database**.
2. Select **Create database**.
3. Start in production mode.
4. Choose a region close to your users.
5. Deploy this repo's `firestore.rules` before real use.

## 4. Add Web App Credentials

1. Go to **Project settings**.
2. In **Your apps**, select the web icon.
3. App nickname:

```text
RJ Meeting Notes Taker Web
```

4. Register the app.
5. Copy the Firebase config object.
6. Create this local file:

```text
public/firebase-config.local.js
```

7. Paste the config like this:

```js
window.RJ_FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};

window.RJ_USE_FIREBASE_EMULATORS = false;
```

Do not commit `public/firebase-config.local.js`.

## 5. Link Local Firebase Project

Create `.firebaserc`:

```json
{
  "projects": {
    "default": "rj-meeting-notes-taker"
  }
}
```

Replace `rj-meeting-notes-taker` if Firebase gives the project a different id.

## 6. Install Firebase Tools

```powershell
npm install
npm run functions:install
```

For deploys, either install Firebase CLI globally:

```powershell
npm install -g firebase-tools
```

Or use the local dev dependency:

```powershell
npx firebase login
npx firebase deploy
```

## 7. Functions Secrets

Create or update:

```text
functions/.env.local
```

Required values:

```text
OPENAI_API_KEY=...
QDRANT_URL=...
QDRANT_API_KEY=...
QDRANT_COLLECTION=rj_meeting_notes
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_ANSWER_MODEL=gpt-4.1-mini
QDRANT_VECTOR_SIZE=1536
```

Do not commit `functions/.env.local`.

## 8. Verify

1. Refresh <http://127.0.0.1:4175>.
2. The Cloud account panel should enable **Sign in with Google**.
3. Sign in.
4. Load sample meeting.
5. Select **Save to cloud**.
6. Refresh saved meetings.
7. Enable **Ask saved cloud notes** and ask a question.
