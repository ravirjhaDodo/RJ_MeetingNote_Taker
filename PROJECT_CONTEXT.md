# RJ Meeting Notes Taker — Project Context

**For AI agents:** read [`CODEX.md`](CODEX.md) first for architecture, API catalog, and file map. This file tracks **workspace rules**, **environment status**, **ports**, **git workflow**, and **operational notes**.

## Project Home

```text
C:\Users\ravir\OneDrive\AI Projects\RJ_MeetingNote_Taker
```

Canonical workspace only. Do not maintain a parallel copy under `Documents\OurSkill Codex Workshop` except as a temporary staging area.

## Product Summary

Live meeting capture (speech → structured notes) with multilingual support, dual transcript panels (including Hindi high-accuracy mode and Bengali Panel B), local and cloud Q&A, exports, and **post-meeting AI notes** (In detail / Summary). Accounts use **UserID + password** (not Firebase-branded signup). Cloud AI features are gated per-user by admins.

## Implemented Architecture (current)

```text
index.html (landing) → signup | login → app.html (meeting)
                              ↓
                    Firebase Auth (internal email per UserID)
                              ↓
              cloud.js → POST /api/rj (Vercel) OR Firebase Functions
                              ↓
              Firestore + Qdrant + OpenAI + Resend
```

### Frontend pages (`public/`)

| File | Purpose |
|------|---------|
| `index.html` | Hero landing, account explainer, CTAs |
| `app.html` | Meeting app (guest allowed for local features) |
| `signup.html`, `login.html`, `forgot-password.html`, `forgot-userid.html` | Auth flows |
| `app.js` | Speech, dual panels, AI notes modal, admin UI, exports, live Q&A |
| `hindi-recorder.js` | High-accuracy Hindi pre-recorded capture |
| `assemblyai-stream.js` | Multi-speaker streaming (AssemblyAI) |
| `cloud.js` | Auth state, backend router, feature helpers |
| `auth.js` | Public registration/recovery API |
| `help/*.html` | Help center (mirrors `docs/help/*.md`) |

### Backend

| Path | Role |
|------|------|
| `api/rj.js` | **Primary** Vercel serverless — all actions via `{ action, data }` |
| `functions/index.js` | Firebase Callable mirror (emulator / optional deploy) |
| `functions/lib/rj-shared.js` | Shared UserID, features, AI prompts, crypto, translation rules |

### Firestore collections

- `userIds/{userId}` — uniqueness registry (Admin SDK only)
- `users/{uid}` — profile, `features`, plan, status
- `users/{uid}/meetings/{meetingId}` — optional `generatedNotes`
- `users/{uid}/meetings/.../segments/{id}`
- `users/{uid}/apiKeys/{id}` — encrypted BYOK

Index: `users.contactEmail` (forgot-UserID lookup). See `firestore.indexes.json`.

### Platform owner

- UserID: `ravirjha`
- Name: Ravi Jha
- Contact: `ravirjha@gmail.com`
- Bootstrap: `npm run seed:owner` or register with that UserID/email

## Feature Access Model

| Feature key | Default on signup | Notes |
|-------------|-------------------|--------|
| `aiMeetingNotes` | Active, 7-day trial | Separate from other cloud AI |
| `cloudQA` | Paused | Needs admin approve/grant |
| `cloudEmbeddings` | Paused | Required for cloud save |
| `autoTranslate` | Active during trial | Panel B cloud translate; also allowed when `aiMeetingNotes` is active |
| `speakerDiarization` | Paused | AssemblyAI multi-speaker streaming |

Plans: `free`, `paid`, `byok` (BYOK requires OpenAI key on profile; AssemblyAI key optional for multi-speaker).

Admins extend/pause/resume each feature with days/weeks/months/years via Admin UI → `adminUpdateUser`.

## API Actions (complete list)

**Public:** `checkUserIdAvailability`, `registerAccount`, `requestPasswordReset`, `requestUserIdReminder`

**Authenticated:** `ensureUserProfile`, `updateUserProfile`, `saveMeeting`, `listMeetings`, `getMeeting`, `askMeeting`, `translateTranscript`, `transcribeAudioChunk`, `getAssemblyAiStreamingToken`, `inferSpeakerNames`, `generateMeetingNotes`, `saveUserApiKey`, `listUserApiKeys`, `deleteUserApiKey`

**Admin:** `listUsers`, `adminUpdateUser`, `adminGenerateTemporaryPassword`

## Local URLs and ports

| Mode | Command | URL | Notes |
|------|---------|-----|--------|
| **Recommended dev** | `npm run serve` | **http://127.0.0.1:5180/** | Hosting + Auth + Functions + Firestore emulators |
| Static only | `python -m http.server 4175` in `public/` | **http://127.0.0.1:4175/** | No emulators; guest/local capture only |
| Vercel dev | `npm run vercel:dev` | **http://127.0.0.1:4175/** | Serves `public/` + `/api/rj` |

**Hosting emulator port 5180** avoids collision with Vite’s default preview port **4173**. Other local projects (SOP Manager, Modern PMO AI) use **5173** for Vite dev — no change needed there.

### Firebase emulator ports (`firebase.json`)

| Service | Port |
|---------|------|
| Hosting | **5180** |
| Auth | 9099 |
| Functions | 5001 |
| Firestore | 8080 |
| Emulator UI | 4000 |

**Emulator data wipe:** Auth and Firestore emulator data are cleared when you stop `npm run serve`. Run `npm run seed:emulator` after each restart for the dev account.

### Backend mode in `public/firebase-config.local.js`

This file is **gitignored and never deployed** (enforced by `.vercelignore`). The committed `firebase-config.js` is the production default (emulators off, vercel backend).

**Default local = behaves exactly like prod** (real Firebase Auth + real deployed `/api/rj`, no Java/emulators needed):

```js
window.RJ_USE_FIREBASE_EMULATORS = false;
window.RJ_BACKEND_MODE = "vercel";
window.RJ_API_BASE_URL = "https://rj-meeting-note-taker.vercel.app/api/rj";
```

`/api/rj` returns scoped CORS headers for `localhost`/`127.0.0.1` and `*.vercel.app` origins, so a local static page can call the real production API. Other origins get no CORS header.

**Firebase emulators (optional):**

```js
window.RJ_BACKEND_MODE = "firebase";
window.RJ_USE_FIREBASE_EMULATORS = true;
```

**Production safety:** `cloud.js` only connects to the `127.0.0.1` Auth/Functions emulators when the page is actually served from a localhost hostname. Even if a local config flag leaks into a deployment, production never points at `127.0.0.1`.

## npm Scripts

```powershell
npm run serve              # emulators: hosting, auth, functions, firestore (needs Java)
npm run serve:lite         # auth, functions, hosting only (no Firestore/Java)
npm run seed:emulator      # dev user after emulator restart (default ravirjha / Ravi@123)
npm run lint
npm run vercel:dev         # static + /api/rj on :4175
npm run functions:install
npm run seed:owner         # production owner bootstrap
npm run set-password -- <userId> <password>
```

`scripts/run-emulators.js` sets `JAVA_HOME` on Windows when JDK is installed but not on PATH.

## Git workflow

- Remote: `https://github.com/ravirjhaDodo/RJ_MeetingNote_Taker`
- Owner: `ravirjhaDodo`

| Branch | Role |
|--------|------|
| **dev1** | Active development on this machine |
| **main** | GitHub release line — sync from `dev1` when you choose to release |
| **dev2** | Stable backup — sync **only when you explicitly ask** |

```powershell
# Normal work
git checkout dev1

# Release to main
git checkout main
git merge dev1
git push origin main
git checkout dev1

# Backup snapshot (manual)
git checkout dev2
git merge dev1
git push origin dev2
git checkout dev1
```

**Do not commit:** `.env.local`, `functions/.env.local`, `public/firebase-config.local.js`, service account JSON, `.cursor/`.

## Vercel Deployment

- **Live production URL:** https://rj-meeting-note-taker.vercel.app
- Vercel project: `ravi-jhas-projects-ea51c036/rj-meeting-note-taker` (Hobby/free plan)
- Static files from `public/`; API at `/api/rj`
- Production Firebase **web** config is committed in `public/firebase-config.js` (public, non-secret); `firebase-config.local.js` overrides it for local emulator dev only
- Deploy via CLI from repo root: `vercel --prod` (env vars already set in Vercel)
- Set/refresh server env vars from `.env.local`: `vercel env add <NAME> production` (all `.env.local.example` keys)
- Production client config defaults: emulators **off**, `RJ_BACKEND_MODE = "vercel"`
- **Required after first deploy:** add `rj-meeting-note-taker.vercel.app` to Firebase Auth authorized domains (Console → Authentication → Settings) or login/signup fails with `auth/unauthorized-domain`
- Deploy Firestore rules: `npx firebase deploy --only firestore`
- Seed owner in production Firestore: `npm run seed:owner`

## Required Secrets (root `.env.local`)

See `.env.local.example`. Required for full cloud:

- `OPENAI_API_KEY`, `OPENAI_EMBEDDING_MODEL`, `OPENAI_ANSWER_MODEL`
- `ASSEMBLYAI_API_KEY` (platform multi-speaker streaming)
- Optional: `OPENAI_NOTES_MODEL` (defaults to answer model)
- `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION`, `QDRANT_VECTOR_SIZE`
- `API_KEY_ENCRYPTION_SECRET` (min 24 chars)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_EMAIL`
- `FIREBASE_SERVICE_ACCOUNT_JSON` (single-line JSON for Vercel)

Do **not** copy `FIREBASE_SERVICE_ACCOUNT_JSON` into `functions/.env.local` (breaks Functions emulator dotenv).

## Firebase Project Status

- Project ID: `rj-meeting-notes-taker`
- Auth: Email/Password enabled (used via internal emails); Google optional
- Firestore: `(default)` in `nam5`
- Storage: rules scaffolded; may require plan upgrade to enable in console
- Local config: `public/firebase-config.local.js` (gitignored)

## Help Documentation

| Source | Path |
|--------|------|
| Markdown (canonical) | `docs/help/*.md` |
| Browser | `public/help/*.html` |

Topics: getting started, account requirements, UserID signup, login/recovery, meeting basics, AI notes, cloud features, admin guide.

## Update Rule

When behavior, APIs, auth model, file structure, ports, or env vars change, update in the same turn:

1. `CODEX.md` (agent guide)
2. `PROJECT_CONTEXT.md` (this file)
3. `README.md` and `docs/setup.md` if setup steps change
4. `docs/firebase-setup.md` if Firebase steps change
5. Relevant `docs/help/*.md` + `public/help/*.html` for user-facing changes
