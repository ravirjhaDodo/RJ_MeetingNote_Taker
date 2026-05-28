# Firebase Setup

Firebase provides **Auth**, **Firestore**, and optional **Storage**. The app’s **default API** runs on **Vercel** (`api/rj.js`), not Firebase Functions — but both use the same Firebase project via Admin SDK / client SDK.

See also: [`CODEX.md`](../CODEX.md), [`setup.md`](setup.md).

## 1. Create Firebase Project

1. [Firebase Console](https://console.firebase.google.com/) → **Add project**
2. Name: **RJ Meeting Notes Taker**
3. Suggested project ID: `rj-meeting-notes-taker`
4. Analytics optional (can disable)

## 2. Enable Authentication

1. **Build → Authentication → Sign-in method**
2. Enable **Email/Password** (required for UserID login via internal emails)
3. Optional: enable **Google** (legacy; primary UX is UserID on `login.html`)
4. Support email: your admin contact (e.g. `ravirjha@gmail.com`)

### UserID auth model

Users never type the internal Firebase email. The app maps:

```text
UserID ravirjha  →  ravirjha@accounts.rj-meeting-notes-taker.app
```

Registration creates Auth user + `userIds/{userId}` + `users/{uid}` via public API.

## 3. Create Firestore Database

1. **Build → Firestore Database → Create**
2. Production mode, choose region (e.g. `nam5`)
3. Deploy rules and indexes from repo:

```powershell
npx firebase deploy --only firestore
```

### Collections (created by app, not manually)

| Collection | Purpose |
|------------|---------|
| `userIds/{userId}` | UserID → uid registry (server-only writes) |
| `users/{uid}` | Profile, features, plan, status |
| `users/{uid}/meetings/{meetingId}` | Saved meetings + optional `generatedNotes` |
| `users/{uid}/meetings/.../segments/{id}` | Transcript segments |
| `users/{uid}/apiKeys/{id}` | Encrypted BYOK keys |

### Index

`users.contactEmail` — required for forgot-UserID email lookup (`firestore.indexes.json`).

## 4. Web App Config

1. **Project settings → Your apps → Web**
2. Register app: **RJ Meeting Notes Taker Web**
3. Copy config to `public/firebase-config.local.js`:

```js
window.RJ_FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "rj-meeting-notes-taker.firebaseapp.com",
  projectId: "rj-meeting-notes-taker",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};

// Local development — pick one:
window.RJ_USE_FIREBASE_EMULATORS = false;
window.RJ_BACKEND_MODE = "vercel";
window.RJ_API_BASE_URL = "/api/rj";
```

For emulator testing:

```js
window.RJ_USE_FIREBASE_EMULATORS = true;
window.RJ_BACKEND_MODE = "firebase";
```

Commit `public/firebase-config.example.js` only — **not** `firebase-config.local.js`.

## 5. Service Account (Vercel / Admin scripts)

1. **Project settings → Service accounts**
2. **Generate new private key**
3. Paste compact JSON into `.env.local` as `FIREBASE_SERVICE_ACCOUNT_JSON=`
4. Add the same variable in **Vercel** environment settings (single line)

Used for: token verification, Firestore, Auth admin (register, reset password, admin actions).

## 6. Link CLI

`.firebaserc`:

```json
{
  "projects": {
    "default": "rj-meeting-notes-taker"
  }
}
```

```powershell
npm install
npm run functions:install
npx firebase login
```

## 7. Authorized domains (production)

**Authentication → Settings → Authorized domains** — add:

- `localhost` (dev)
- Your Vercel domain (`*.vercel.app` or custom domain)

## 8. Emulators (optional local)

```powershell
npx firebase emulators:start --only auth,functions --project rj-meeting-notes-taker
```

| Emulator | Port |
|----------|------|
| Auth | 9099 |
| Functions | 5001 |
| UI | 4000 |

Set `RJ_USE_FIREBASE_EMULATORS = true` in local config.

Create emulator user (after each emulator restart):

```powershell
npm run seed:emulator
```

Or manually:

```powershell
$env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
$env:GCLOUD_PROJECT="rj-meeting-notes-taker"
npm run set-password -- ravirjha "your-password"
```

**Note:** If ports 9099/4000 are in use, stop old emulator processes or change ports in `firebase.json`.

Firestore emulator requires **JDK 11+**. `npm run serve` uses `scripts/run-emulators.js` to set `JAVA_HOME` when Java is installed but not on PATH. Or set `JAVA_HOME` manually (e.g. `C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot`).

## 9. Owner bootstrap (production)

```powershell
npm run seed:owner
```

Creates UserID `ravirjha`, admin role, contact `ravirjha@gmail.com`. Password from `OWNER_SEED_PASSWORD` env or script default.

## 10. Verify end-to-end

1. **http://127.0.0.1:5180/** (with `npm run serve`) or **http://127.0.0.1:4175/** (static/vercel) — landing loads
2. **signup.html** — register a test UserID
3. Admin approves user on **app.html → Admin** (or use owner account)
4. **app.html** — listen, save cloud, generate AI notes, cloud Q&A
5. **login.html** — UserID + password (not contact email)

## 11. Storage (avatars)

Enable **Firebase Storage** in console if needed. Deploy:

```powershell
npx firebase deploy --only storage
```

Storage may require upgrading from Spark plan depending on console state.

## 12. Security rules summary

- `userIds/*` — no client access (server Admin SDK only)
- `users/{uid}/**` — read/write only when `request.auth.uid == uid`

See `firestore.rules` in repo root.
