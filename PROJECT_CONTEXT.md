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
| `app.js` | Speech, dual panels, AI notes modal, admin UI, exports, live Q&A, capture source selector, transcript import |
| `capture.js` | Pluggable capture: mic close-talk, mic room/passive, meeting audio (getDisplayMedia), both (mixed) |
| `transcript-import.js` | Parse Teams/Zoom `.vtt` / `.txt` into speaker-labeled lines |
| `hindi-recorder.js` | High-accuracy Hindi pre-recorded capture |
| `assemblyai-stream.js` | Multi-speaker streaming (AssemblyAI) |
| `cloud.js` | Auth state, backend router, feature helpers |
| `auth.js` | Public registration/recovery API |
| `manifest.webmanifest`, `sw.js`, `pwa.js`, `icon.svg` | PWA install shell and static asset cache |
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

**Admin:** `listUsers`, `adminUpdateUser`, `adminGenerateTemporaryPassword`, `adminDeleteUser`

**Account security:** `adminGenerateTemporaryPassword` marks `requiresPasswordChange`, `temporaryPasswordCreatedAt`, and a 24-hour `temporaryPasswordExpiresAt`. Users can sign in with the temporary password, but cloud/admin actions are blocked until they change it; expired temporary passwords require a new admin reset. `clearTemporaryPasswordState` is called after a successful password change and verifies Firebase Auth shows a later token-valid-after time before clearing the lock.

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

`/api/rj` returns scoped CORS headers for `localhost`/`127.0.0.1` and the production URL by default. Additional preview/custom origins must be listed in `RJ_ALLOWED_ORIGINS` as a comma-separated allowlist. Other origins get no CORS header.

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
- Current working branch for local development and testing: `dev1`

| Branch | Role |
|--------|------|
| **dev1** | Active development on this machine |
| **main** | GitHub release line — sync from `dev1` when you choose to release |
| **dev2** | Stable backup — sync **only when you explicitly ask** |

Current release policy:

1. Build and test locally on `dev1` first.
2. Do not push, merge, or update `main` until Ravi is satisfied with local testing.
3. Keep `dev2` one version behind as the backup/stable rollback branch.
4. Prefer a Vercel preview/test deployment from `dev1` instead of using production as the only test environment.
5. Treat local capture work as staged by milestones: clean browser capture/import first, then Electron desktop loopback spike.

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

### Two-computer / OneDrive workflow

The project folder lives inside OneDrive (`C:\Users\ravir\OneDrive\AI Projects\RJ_MeetingNote_Taker`) and is opened from more than one computer. **GitHub is the source of truth and backup; OneDrive is convenience only.**

Rules to avoid `.git` corruption:

1. **Never work on both computers at the same time.**
2. Set OneDrive to **"Always keep on this device"** so `.git` files are never cloud-only placeholders (Git cannot read dehydrated placeholders reliably).
3. Before switching machines, **close the editor/terminal and wait for OneDrive to show "Up to date" (green check)**. Switching mid-sync can leave a partial `.git` state.
4. Keep committing and pushing `dev1` to GitHub so a clean `git clone` is always available for recovery if OneDrive leaves a half-synced or conflicted `.git`.
5. `node_modules/` and `functions/node_modules/` are gitignored but still physically present, so OneDrive syncs them (slow, many tiny files). Prefer excluding them from OneDrive sync and run `npm install` locally on each machine instead.

Recommended per-session loop (whichever machine you use):

```powershell
git checkout dev1
git pull origin dev1   # start: get latest
# ... work and commit ...
git push origin dev1   # end: publish before switching machines
```

Cleanest alternative (zero `.git` corruption risk): keep the repo **outside** OneDrive (e.g. `C:\Dev\RJ_MeetingNote_Taker`) and sync only through GitHub.

> **Never run `robocopy /MIR` (or recursive deletes) against anything under `node_modules`.** A self-referential `file:..` dependency can create a junction pointing back to the repo root, and `/MIR` will follow it and wipe the whole project. `functions/package.json` must **not** depend on `rj-meeting-notes-taker` (`file:..`); the functions code uses `functions/lib/rj-shared.js`, not the root package.

<!-- fs-loop-check: ok -->
(Self-referential `file:..` dependency removed and recursive `node_modules` loop cleaned on 2026-06-01.)

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
- Optional `RJ_ALLOWED_ORIGINS` for additional `/api/rj` preview/custom origins

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

Topics: getting started, account requirements, UserID signup, login/recovery, meeting basics (capture sources, import), AI notes, cloud features, admin guide.

**Desktop capture (replace Zoom-style notes on same PC):** phased plan in `docs/desktop-capture-implementation-plan.md`; technical options in `docs/silent-capture-plan.md`. Browser-only cannot reliably capture Teams desktop audio on Windows (debug May 2026); Electron + WASAPI loopback is the intended fix (Option C-1).

**Validated web workaround for Teams/Zoom desktop playback:** set input/mic to the laptop microphone and output/speaker to Jabra or external speakers, then use **Room listening** with **Multi-speaker**. This captures playback acoustically and can identify speakers, but diarization may mix speakers during overlaps. This is a practical web fallback, not a replacement for the planned desktop loopback app.

**English speaker cleanup:** dev1 now has a **Clean labels** action in the Speakers panel and automatically runs the same cleanup after stopping an English Multi-speaker session. It repairs short speaker-label flips where one or two brief transcript lines are surrounded by the same speaker. This improves common diarization mistakes without replacing manual rename/merge review.

**App shell / PWA (Jul 2026):** app workspace uses a desktop left navigation rail and mobile horizontal tab navigation to reduce top-level clutter. `app.html` links `manifest.webmanifest`, `icon.svg`, and `pwa.js`; `sw.js` caches static shell assets for install/offline startup while bypassing `/api/*` and Firebase config files so auth/backend behavior stays fresh.

**Diarization session map (Jun 2026):** each time Multi-speaker listening starts, AssemblyAI labels (A/B/C…) map to **new** speaker rows for that session. Prior transcript lines keep their old labels. **Continue current meeting** shows a hint about fresh A/B/C mapping; changing **Expected speakers** while stopped is remembered and warned in that dialog. Cloud/local auto-rename only applies on a clear **self-intro** on that speaker’s lines (not when others say “Nick” / “Ravi”). One-speaker dominance hint appears when ~65% of recent lines share one voice.

**English speaker identification focus:** dev1 now exposes **Expected speakers** for Multi-speaker capture and sends that value to AssemblyAI for all four capture sources. Default is 4 speakers; **Auto detect (up to 8)** lets AI identify speakers when the count is unknown, while fixed counts are steadier when the participant count is known. English sessions also get a transcription prompt for natural English meeting turns. Clean-label stabilization now applies to all English Multi-speaker captures, not just Room listening, and streaming turns also smooth tiny in-turn speaker flips before Panel A receives them.

**Multilingual room-listening test result:** English room listening captured well. Mixed mode captured English but missed Hindi in the same meeting. Hindi listen mode captured both Hindi and English, with Devanagari output for Hindi, but Hindi accuracy and speaker separation were weak. Product implication: recommend English room listening for English meetings; treat Hindi/English acoustic live capture as experimental; use Hindi high-accuracy mode, transcript import, or future desktop/recorded pass for better Hindi quality and speaker cleanup.

## Update Rule

When behavior, APIs, auth model, file structure, ports, or env vars change, update in the same turn:

1. `CODEX.md` (agent guide)
2. `PROJECT_CONTEXT.md` (this file)
3. `README.md` and `docs/setup.md` if setup steps change
4. `docs/firebase-setup.md` if Firebase steps change
5. Relevant `docs/help/*.md` + `public/help/*.html` for user-facing changes
