# RJ Meeting Notes Taker — Setup

Project root:

```text
C:\Users\ravir\OneDrive\AI Projects\RJ_MeetingNote_Taker
```

**AI agents:** see [`CODEX.md`](../CODEX.md) for full architecture. **Status/secrets:** [`PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md).

## What you need

| Tier | Requirements |
|------|----------------|
| **Guest / local only** | Browser (Chrome/Edge), Python for static server |
| **Cloud + AI** | Firebase project, OpenAI, Qdrant, Resend, Vercel or Firebase Functions env |

## 1. Clone and install

```powershell
cd "C:\Users\ravir\OneDrive\AI Projects\RJ_MeetingNote_Taker"
npm install
npm run functions:install
```

On some Windows setups: `npm install --strict-ssl=false` if TLS errors occur.

## 2. Local config files (gitignored)

Create from examples:

```powershell
Copy-Item public\firebase-config.example.js public\firebase-config.local.js
Copy-Item .env.local.example .env.local
Copy-Item .firebaserc.example .firebaserc
```

Edit `public/firebase-config.local.js` with your Firebase web app config from the console.

### Backend mode in `firebase-config.local.js`

**Vercel API (production-like):**

```js
window.RJ_USE_FIREBASE_EMULATORS = false;
window.RJ_BACKEND_MODE = "vercel";
window.RJ_API_BASE_URL = "/api/rj";
```

**Firebase emulators:**

```js
window.RJ_USE_FIREBASE_EMULATORS = true;
window.RJ_BACKEND_MODE = "firebase";
```

## 3. Environment variables

### Root `.env.local` (Vercel + `api/rj.js`)

Copy from `.env.local.example`. All keys listed there are required for full cloud operation.

`FIREBASE_SERVICE_ACCOUNT_JSON` must be **one line** of JSON from Firebase Console → Project settings → Service accounts → Generate new private key.

### `functions/.env.local` (emulator only)

Copy from root **except** `FIREBASE_SERVICE_ACCOUNT_JSON` (breaks emulator dotenv).

Sync helper — see `PROJECT_CONTEXT.md`.

## 4. Run the app

### Recommended — Firebase emulators (one terminal)

```powershell
npm run serve
```

Open **http://127.0.0.1:5180/** (hosting emulator). Set `RJ_BACKEND_MODE = "firebase"` and `RJ_USE_FIREBASE_EMULATORS = true` in `firebase-config.local.js`.

### Alternate — static + backend (two terminals)

**Terminal A — frontend only:**

```powershell
cd public
python -m http.server 4175 --bind 127.0.0.1
```

**Terminal B — backend (choose one):**

**Vercel dev** (serves `/api/rj` on same port as static if you use vercel for both):

```powershell
npm run vercel:dev
```

**Firebase emulators (lite — no Firestore/Java):**

```powershell
npm run serve:lite
```

(`serve` auto-finds JDK for Firestore — e.g. `C:\Program Files\Microsoft\jdk-*`. If it still fails, set `JAVA_HOME` to your JDK folder and ensure `bin` is on PATH.)

```powershell
npm run serve:lite
```

Auth + Functions + hosting only (no Firestore emulator, no Java needed).

If port 9099 is busy, stop the old emulator process first.

## 5. Create admin user (local emulators)

Emulator Auth/Firestore data is **wiped when you stop `npm run serve`**. After each restart, seed the dev account once:

```powershell
npm run seed:emulator
```

Defaults: UserID `ravirjha`, password `Ravi@123`. Custom user:

```powershell
npm run seed:emulator -- otheruser "TheirPass123"
```

Requires emulators running (`npm run serve`). Then log in at http://127.0.0.1:5180/login.html.

**Manual (same as seed:emulator):**

```powershell
$env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
$env:GCLOUD_PROJECT="rj-meeting-notes-taker"
npm run set-password -- ravirjha "your-password"
```

**Production** (service account in `.env.local`):

```powershell
Remove-Item Env:FIREBASE_AUTH_EMULATOR_HOST -ErrorAction SilentlyContinue
npm run seed:owner
# or
npm run set-password -- ravirjha "your-password"
```

Log in at **http://127.0.0.1:4175/login.html** with UserID `ravirjha` (not email).

Or use **signup.html** for a new UserID (pending admin approval unless owner email).

## 6. Verify

1. Open **http://127.0.0.1:5180/app.html** (emulators) or **http://127.0.0.1:4175/app.html** (static) — load sample meeting, search, export.
2. Log in — cloud panel enables when profile is `active`.
3. Save to cloud (needs `cloudEmbeddings` feature + admin approval).
4. Stop listening — AI notes prompt (needs `aiMeetingNotes` trial or grant).
5. Admin page — approve users, extend features (admin role).

## 7. Deploy to Vercel

1. Import GitHub repo in Vercel.
2. Add all `.env.local` variables to Vercel Environment Variables.
3. Set production `public/firebase-config.js` (or build inject):
   - `RJ_USE_FIREBASE_EMULATORS = false`
   - `RJ_BACKEND_MODE = "vercel"`
4. Firebase Console → Authentication → Authorized domains → add `your-app.vercel.app`.
5. Deploy Firestore rules: `npx firebase deploy --only firestore,firestore:indexes`

```powershell
npx vercel --prod
```

## 8. Deploy Firebase (optional)

Rules and indexes only if not using Vercel for API:

```powershell
npx firebase login
npx firebase deploy --only firestore
```

Functions deploy is optional; Vercel is the default API path.

## Help

User docs: `docs/help/` and `public/help/`.
