# RJ Meeting Notes Taker

Live meeting notes in the browser: speech capture, structured decisions/actions/risks, multilingual transcripts, cloud save, semantic Q&A, and **AI-generated meeting notes** after each session.

The meeting app is installable as a PWA from supported browsers on desktop and mobile. Open `/app.html`, then use the browser's install/add-to-home-screen action.

## Quick start (local — full stack)

```powershell
cd "C:\Users\ravir\OneDrive\AI Projects\RJ_MeetingNote_Taker"
npm install
npm run functions:install
npm run serve
```

In another terminal (after emulators are up):

```powershell
npm run seed:emulator
```

Open **http://127.0.0.1:5180/** (landing) or **http://127.0.0.1:5180/app.html** (meeting). Log in at **http://127.0.0.1:5180/login.html** with UserID `ravirjha` (default dev password from seed script).

Configure `public/firebase-config.local.js` with `RJ_USE_FIREBASE_EMULATORS = true` and `RJ_BACKEND_MODE = "firebase"`. See [docs/setup.md](docs/setup.md).

### Static-only (no emulators)

```powershell
cd public
python -m http.server 4175 --bind 127.0.0.1
```

Open **http://127.0.0.1:4175/app.html** — local capture works without login; cloud features need a backend.

## Documentation map

| Document | Audience |
|----------|----------|
| [**CODEX.md**](CODEX.md) | AI agents / Codex — architecture, APIs, file map |
| [**PROJECT_CONTEXT.md**](PROJECT_CONTEXT.md) | Living project status, ports, git branches, env |
| [docs/setup.md](docs/setup.md) | Install, env files, local + Vercel run |
| [docs/firebase-setup.md](docs/firebase-setup.md) | Firebase console checklist |
| [docs/help/](docs/help/) | End-user help (markdown) |

## Stack

- **Frontend:** static HTML/JS in `public/`
- **Auth:** Firebase Auth with UserID-based internal emails
- **API:** Vercel `api/rj.js` (default) or Firebase Functions
- **Data:** Firestore, Qdrant vectors, OpenAI, Resend email

## Key URLs (production)

After Vercel deploy: site root = landing, `/app.html` = app, `/api/rj` = backend.

## Scripts

```powershell
npm run serve
npm run seed:emulator
npm run lint
npm run vercel:dev
npm run set-password -- ravirjha "your-password"
npm run seed:owner
```

## License / status

Private prototype. See `PROJECT_CONTEXT.md` for implementation status and service configuration.
