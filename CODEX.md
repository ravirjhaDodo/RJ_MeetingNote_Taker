# Codex / AI Agent Guide — RJ Meeting Notes Taker

Read this file first when working in this repository. **`PROJECT_CONTEXT.md`** holds environment-specific status and secrets notes; this file explains **what is built** and **how pieces connect**.

## What this app is

Browser-based meeting notes: live speech → structured transcript → search/Q&A → optional cloud save → **AI-generated meeting notes** (detail or summary) after the meeting.

**Production backend default:** Vercel serverless `POST /api/rj`  
**Alternate backend:** Firebase Callable Functions in `functions/index.js` (emulator/local)  
**Shared logic:** `functions/lib/rj-shared.js` (imported by `api/rj.js` and Functions)

## Implemented feature checklist (May 2026)

| Area | Status |
|------|--------|
| Hero landing (`index.html`) | Done |
| Meeting app (`app.html`) | Done |
| UserID + password auth (signup/login/forgot) | Done |
| Internal auth email `{userId}@accounts.rj-meeting-notes-taker.app` | Done |
| `userIds/{userId}` registry + `users/{uid}` profiles | Done |
| Dual-panel transcript (original + translated) | Done |
| Preferred language + translate toggle | Done |
| Post-meeting AI notes (detail/summary) | Done |
| Per-feature access (AI notes, Q&A, embeddings, translate) | Done |
| Admin: approve/reject/pause/revoke, plans, feature extend/pause | Done |
| BYOK encrypted OpenAI keys | Done |
| Help center `docs/help/` + `public/help/` | Done |
| Owner seed + set-password scripts | Done |
| Vercel deploy config | Done |

## File map (edit the right file)

```text
public/
  index.html          Landing / marketing
  app.html            Main meeting UI
  signup.html         Register (public API)
  login.html          UserID login
  forgot-password.html
  forgot-userid.html
  app.js              Meeting logic, dual panels, AI notes UI, admin UI
  cloud.js            Firebase client + backend router (Vercel vs Functions)
  auth.js             Public auth API + password toggles
  styles.css          App styles
  landing.css         Landing/auth styles
  help/*.html         User-facing help mirrors

api/rj.js             Vercel serverless handler (all actions)
functions/
  index.js            Firebase Callable mirrors of api/rj.js
  lib/rj-shared.js    Shared: UserID rules, features, AI prompts, crypto helpers
  scripts/
    set-user-password.js

scripts/
  seed-platform-owner.js   One-time owner bootstrap (production SA)

docs/help/            Canonical help markdown
firestore.rules       userIds server-only; users/{uid} client scoped
firestore.indexes.json  users.contactEmail
vercel.json           Static public/ + api/rj function
firebase.json         Hosting + functions + emulators
```

## URL routes (local)

| Mode | Base URL |
|------|----------|
| `npm run serve` (emulators) | **http://127.0.0.1:5180** |
| Static Python / `vercel:dev` | **http://127.0.0.1:4175** |

| Path | File |
|------|------|
| `/` | `public/index.html` |
| `/app.html` | Meeting app (guest OK) |
| `/signup.html`, `/login.html` | Auth |
| `/help/*.html` | Help |

Vercel serves `public/` at site root; `api/rj` is the API route. See **`PROJECT_CONTEXT.md`** for ports and git workflow.

## Auth model (critical for agents)

- Users log in with **UserID + password**, not contact email.
- Firebase Auth email is **internal only**: `ravirjha@accounts.rj-meeting-notes-taker.app`
- **contactEmail** on profile is for Resend and forgot-UserID lookup; multiple UserIDs can share one contact email.
- **Platform owner:** UserID `ravirjha`, contact `ravirjha@gmail.com` → auto admin on register/seed.
- Public API actions (no Bearer token): `checkUserIdAvailability`, `registerAccount`, `requestPasswordReset`, `requestUserIdReminder`

## Backend routing (`public/cloud.js`)

```js
window.RJ_BACKEND_MODE = "vercel" | "firebase"
window.RJ_API_BASE_URL = "/api/rj"   // vercel mode
window.RJ_USE_FIREBASE_EMULATORS = true  // → Auth :9099, Functions :5001
```

- **Vercel:** `fetch("/api/rj", { action, data })` + `Authorization: Bearer <idToken>`
- **Firebase:** `httpsCallable(functions, actionName)`
- **Public actions:** `RJCloud.publicAction()` or `auth.js` `publicApi()`

Keep **`api/rj.js` and `functions/index.js` in sync** when adding actions.

## API action catalog

All actions: `POST` body `{ "action": "<name>", "data": { ... } }`.

| Action | Auth | Purpose |
|--------|------|---------|
| `checkUserIdAvailability` | Public | `{ userId }` → `{ available, userId }` |
| `registerAccount` | Public | Signup fields → creates Auth + userIds + users |
| `requestPasswordReset` | Public | `{ userId }` → Resend reset link to contactEmail |
| `requestUserIdReminder` | Public | `{ contactEmail }` → email all UserIDs |
| `ensureUserProfile` | User | Merge token into Firestore profile |
| `updateUserProfile` | User | displayName, photoURL, preferredLanguage, names |
| `saveMeeting` | User + `cloudEmbeddings` | segments, title, optional meetingId, generatedNotes |
| `listMeetings` | User | Saved meetings list |
| `askMeeting` | User + `cloudQA` | question, optional meetingId |
| `translateTranscript` | User + `autoTranslate` | text, targetLanguage |
| `getAssemblyAiStreamingToken` | User + `speakerDiarization` or AssemblyAI BYOK | temp streaming token |
| `inferSpeakerNames` | User + `aiMeetingNotes` or `autoTranslate` | segments → name suggestions |
| `generateMeetingNotes` | User + `aiMeetingNotes` | mode, title, metadata, sections, segments |
| `saveUserApiKey` / `listUserApiKeys` / `deleteUserApiKey` | User | BYOK |
| `listUsers` | Admin | All users with serialized profiles |
| `adminUpdateUser` | Admin | See admin actions below |
| `adminGenerateTemporaryPassword` | Admin | `{ uid }` |

### `adminUpdateUser` actions

`approve`, `reject`, `pause`, `revoke`, `makeAdmin`, `makeUser`, `guest`, `stopGuest`, `setPlan` (`free`|`paid`|`byok`), `extendFeature`, `pauseFeature`, `resumeFeature` (with `featureKey`, `amount`, `unit`).

Feature keys: `aiMeetingNotes`, `cloudQA`, `cloudEmbeddings`, `autoTranslate`, `speakerDiarization`.

## Firestore data model

### `userIds/{userId}` (server write only)

```js
{ uid, contactEmail, createdAt }
```

### `users/{uid}`

```js
{
  userId, email, contactEmail, firstName, lastName, displayName, photoURL,
  preferredLanguage: "en",
  role: "admin" | "user",
  status: "pending" | "active" | "rejected" | "paused" | "revoked",
  plan: "free" | "paid" | "byok",
  features: {
    aiMeetingNotes: { status, expiresAt, source },
    cloudQA: { ... },
    cloudEmbeddings: { ... },
    autoTranslate: { ... }
    speakerDiarization: { ... }
  },
  aiNotesTrialEndsAt,  // 7-day trial on signup (non-admin)
  trialEndsAt, platformApiAccess, guestApiAccess, guestApiExpiresAt,
  ...
}
```

### `users/{uid}/meetings/{meetingId}`

```js
{
  title, segmentCount, createdAt, updatedAt,
  generatedNotes: { mode, markdown, language, createdAt }  // optional
}
```

### `users/{uid}/meetings/{meetingId}/segments/{segmentId}`

```js
{
  id, speakerId, speaker, type, text, originalText, language, timestamp, order
}
```

### `users/{uid}/apiKeys/{keyId}`

Encrypted BYOK keys (AES-256-GCM).

## Feature gating (`canUseFeature` in `rj-shared.js`)

- **Admins:** all features.
- **Non-admin:** `status === "active"` and not past `expiresAt`.
- **aiMeetingNotes + source trial:** also check `aiNotesTrialEndsAt`.
- **Defaults on signup:** AI notes trial 7 days; cloud Q&A/embeddings/translate **paused** until admin approves/grants.

OpenAI routing: `plan === "byok"` → user's OpenAI key; else platform `OPENAI_API_KEY`.

## AI meeting notes

- **Triggers:** stop listening / silence auto-stop (if content), or manual **Create meeting notes**.
- **Guests:** button visible, disabled, signup CTA.
- **Prompt rules:** human tone, no emojis except status balls (red/yellow/green/blue), markdown tables, sections.
- **Input:** structured sections + translated segments + metadata.
- **Output:** in-app viewer, export MD/Word/PDF, auto `saveMeeting` when signed in.

## Scripts

```powershell
npm run serve               # hosting :5180 + auth + functions + firestore
npm run serve:lite          # hosting :5180 + auth + functions (no Firestore/Java)
npm run seed:emulator       # dev user after emulator restart
npm run lint
npm run vercel:dev          # static + /api/rj on :4175
npm run seed:owner          # production SA — ravirjha owner
npm run set-password -- ravirjha "new-password"

# Manual emulator password (same as seed:emulator):
$env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
$env:GCLOUD_PROJECT="rj-meeting-notes-taker"
npm run set-password -- ravirjha "password"
```

## Local dev (typical)

**Recommended — one command (set `RJ_BACKEND_MODE=firebase` in firebase-config.local.js):**

```powershell
npm run serve
npm run seed:emulator
# → http://127.0.0.1:5180/app.html
```

**Alternate — static + Vercel API:**

```powershell
cd public && python -m http.server 4175 --bind 127.0.0.1
# other terminal:
npm run vercel:dev
```

`public/firebase-config.local.js` from `firebase-config.example.js` — **gitignored**.

## Vercel deploy

1. Connect repo; root directory = project root (`public/` auto-served).
2. Set all env vars from `.env.local.example` (especially `FIREBASE_SERVICE_ACCOUNT_JSON` as one line).
3. Production `firebase-config.js`: `RJ_USE_FIREBASE_EMULATORS = false`, `RJ_BACKEND_MODE = "vercel"`.
4. Firebase Console → Auth → Authorized domains → add `*.vercel.app`.
5. `npx firebase deploy --only firestore` for rules/indexes.

## Agent editing rules

1. **Dual backend:** change both `api/rj.js` and `functions/index.js` for new endpoints.
2. **Shared logic:** put validators, feature checks, prompts in `functions/lib/rj-shared.js`.
3. **Do not commit:** `.env.local`, `functions/.env.local`, `firebase-config.local.js`, `.firebaserc` with secrets.
4. **Do not edit** user help in plan files under `.cursor/plans/`.
5. **Guest path:** `app.html` works without login; cloud/AI gates in `app.js` + `cloud.js`.
6. **UserID auth pages** use `auth.js`; meeting app uses `login.html`, not embedded profile signup.

## Related docs

- `PROJECT_CONTEXT.md` — living status, secrets checklist, ports, git remote
- `docs/setup.md` — install and run
- `docs/firebase-setup.md` — Firebase console steps
- `docs/help/*.md` — end-user documentation
