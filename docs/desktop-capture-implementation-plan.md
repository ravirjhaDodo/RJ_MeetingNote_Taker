# Desktop capture implementation plan (Option C)

**Status:** Planning (May 2026)  
**Goal:** Replace Zoom/Teams built-in note-taking for the **same-PC secretary** use case with RJ Meeting Notes Taker — digital capture of all meeting audio (remote participants + playback + your mic), plus existing differentiators (dual panel, AI notes, Q&A, admin, Hindi accuracy, etc.).

**Companion doc:** [`silent-capture-plan.md`](silent-capture-plan.md) (technical options summary).  
**This doc:** Phases, acceptance criteria, architecture, and decisions.

---

## 1. Problem statement (evidence-based)

Debug sessions (session `81d54c`, Windows, Teams **desktop app**, Jabra SPEAK 510 USB) proved:

| Approach | Result |
|----------|--------|
| Browser **Close talk** | Echo cancellation removes meeting audio on same headset — only user voice. |
| Browser **Room listening** (`micRoom`) | User voice transcribes; meeting playback at mic ~**0.005–0.02** raw vs ~**0.1+** when speaking — ASR rarely fires for remote/playback-only content. |
| Browser **Meeting audio** / **Mic + meeting** (`getDisplayMedia`) | **Window → Teams:** audio track present but **silent** (`systemPeak: 0`). **Monitor share:** same — `probePeak: 0` even with “System Audio” track. Chrome cannot auto-enable “Share system audio”; toggle resets each prompt. |
| **Zoom My Notes** (same session) | Captures digital meeting + user voice — expected: Zoom is **inside** the meeting/recording pipeline. |

**Conclusion:** A **hosted web app alone cannot match Zoom capture** for Teams/Zoom **desktop** on Windows. The product gap is **OS-level digital audio**, not transcription vendor or UI polish.

**Product principle:** We are **not** replacing Zoom by importing its transcript. We are **not** joining meetings as a bot. We **are** building a secretary that hears what the computer plays — silently, after one install.

---

## 2. Product scope

### In scope (Option C program)

| Use case | Description |
|----------|-------------|
| **UC1 — Same PC, desktop meeting app** | Teams/Zoom **desktop** running on the machine where RJ runs; capture all participants digitally. |
| **UC2 — Same PC, prerecorded playback** | User plays a recorded meeting in Teams/desktop player; capture speech from recording. |
| **UC3 — Same PC, browser meeting tab** | Optional: loopback still covers tab audio; browser `system` share remains fallback in web-only build. |
| **UC4 — Your voice + meeting** | `native` + Jabra mic (`both` equivalent): digital meeting mix + local mic without echo-cancel killing remote audio. |

### Out of scope (this program; separate tracks)

| Item | Notes |
|------|--------|
| Meeting bot / joining Zoom as participant | Explicitly excluded by product direction. |
| **Separate laptop** in another room | Still **acoustic** (`micRoom`) or future network audio bridge — not WASAPI loopback. |
| Import Zoom/Teams VTT as primary path | Optional **fallback** only; not the replacement strategy. |
| Browser extension only (C-3) | Does **not** solve Teams **desktop**; defer unless web-only SKU. |
| Virtual cable DIY (C-2) | Document for power users; not the main SKU. |
| Linux desktop | Phase 3+ unless demand is clear. |

### Success criteria (program level)

1. With Teams desktop playing a recording **and Zoom closed**, Panel A receives **multiple speakers** and **content the user did not speak** (compare to Zoom My Notes on same clip).
2. **No per-session** Chrome share dialog for meeting audio in desktop app.
3. One-time install + one-time OS permission; then **Start listening** works like Zoom notes.
4. Existing web app features unchanged (Firestore, AssemblyAI, AI notes, panels).
5. Browser build remains available for close-talk / guest / no-install trials.

---

## 3. Recommended approach: C-1 Electron (primary SKU)

| Option | Verdict |
|--------|---------|
| **C-1 Electron + OS loopback** | **Primary** — matches “replace Zoom notes on this PC.” |
| C-2 Virtual cable | Support article only; no engineering priority. |
| C-3 Extension | **Not** for Teams desktop; optional later for web-meetings SKU. |

### Architecture (target)

```text
┌─────────────────────────────────────────────────────────────┐
│  Electron main process                                       │
│  - WASAPI loopback (Win) / ScreenCaptureKit audio (macOS)    │
│  - Optional: device picker (output device / “default”)       │
│  - Expose MediaStream to renderer via preload                │
└──────────────────────────┬──────────────────────────────────┘
                           │ contextBridge: RJCaptureNative
┌──────────────────────────▼──────────────────────────────────┐
│  Renderer: existing public/ UI (app.html, app.js, …)         │
│  RJCapture.acquire({ source: "native" | "bothNative" })      │
│  → assemblyai-stream.js / hindi-recorder.js (unchanged)      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
                    Vercel /api/rj (unchanged)
```

### RJCapture extension (already designed)

Add to `public/capture.js`:

| Source | Behavior |
|--------|----------|
| `native` | Digital loopback only (meeting audio). |
| `bothNative` | Loopback + `micRoom` (or raw mic) mixed — Jabra secretary. |

Detect desktop shell:

```js
RJCapture.nativeSupported() // true when preload exposes acquireNative
```

Web build: options hidden or disabled; no behavior change.

---

## 4. Phased roadmap

### Phase 0 — Planning & spike (1–2 weeks)

**Deliverables**

- [ ] This plan reviewed and signed off.
- [ ] **Spike repo folder** `desktop/` (or `electron/`) with minimal Electron shell loading `public/app.html`.
- [ ] **Spike proof:** Windows loopback → `MediaStream` → log RMS/peak + 30s AssemblyAI stream → transcript contains **non-user** speech from Teams recording.
- [ ] Decision log: `desktopCapturer`+`chromeMediaSource` vs Node native addon (see §5).
- [ ] Remove or gate debug instrumentation in `capture.js` / `assemblyai-stream.js` / `app.js` after spike (separate PR).

**Exit criteria:** Spike demo recorded; peak > 0.05 during Teams playback without user speaking; at least one ASR turn from recording-only segment.

---

### Phase 1 — Windows MVP desktop app (3–5 weeks)

**Deliverables**

- [ ] `desktop/` package: Electron 33+, electron-builder, Windows x64 installer.
- [ ] `preload.js` + `main.js`: `RJCaptureNative.acquireLoopback()` → `MediaStream`.
- [ ] Wire `native` + `bothNative` in `capture.js` (call into `window.RJCaptureNative` when present).
- [ ] UI: capture selector entries + hints; default **bothNative** for signed-in multi-speaker users on desktop.
- [ ] Auto-detect Electron: hide broken `system`/`both` (getDisplayMedia) or show “use Silent capture” banner.
- [ ] One-time permission UX (Windows privacy / microphone if needed).
- [ ] `docs/help/` + installer README: install, permissions, Teams desktop, Jabra.
- [ ] CI: build artifact (unsigned OK for dev); signed build process documented.

**Exit criteria (UC1–UC4 on Windows 11)**

- Teams desktop recording plays; Panel A shows remote speakers without user speaking.
- User can speak on Jabra; both appear in transcript.
- No Chrome share dialog for meeting audio.
- Web app at 4175/5180 still works for `mic` / `micRoom`.

**Not in Phase 1:** macOS, auto-update, Microsoft Store.

---

### Phase 2 — macOS + polish (2–4 weeks)

- [ ] macOS loopback (ScreenCaptureKit / Electron desktopCapturer audio).
- [ ] Code signing + notarization (macOS), Authenticode (Windows).
- [ ] Auto-update (electron-updater) pointing at GitHub Releases or static bucket.
- [ ] Crash/logging (optional Sentry in desktop shell only).
- [ ] Device selector: “System default output” vs specific output (e.g. Jabra).

---

### Phase 3 — Product hardening (ongoing)

- [ ] Separate-laptop strategy (acoustic tuning doc or network bridge research).
- [ ] Installer size / launch time optimization.
- [ ] Enterprise deployment (MSI, managed install).
- [ ] Telemetry: capture source, fallback rate, silent loopback health (privacy-safe).

---

## 5. Technical decisions (Windows)

### 5.1 Loopback implementation options

| Approach | Pros | Cons |
|----------|------|------|
| **A. Electron `desktopCapturer` + `getUserMedia` with `chromeMediaSource: 'desktop'`** | No native compile; fits MediaStream pipeline | May still need picker on some versions; verify loopback on Win 11 + Teams |
| **B. Node native addon (WASAPI loopback)** | Full control, silent | Build complexity, ABI per Electron version |
| **C. `electron-audio-loopback` / community packages** | Faster spike | Maintenance risk |

**Spike order:** Try A first (fastest). If silent track repeats browser behavior, move to B.

### 5.2 Audio format

- Match existing pipeline: **16 kHz mono PCM** (already in `assemblyai-stream.js`).
- Resample in renderer `AudioContext` if loopback is 48 kHz stereo.

### 5.3 Echo / double capture

- **`bothNative`:** loopback = meeting; mic = `micRoom` (echoCancellation **false**).
- Do **not** use close-talk mic when loopback carries meeting audio.

### 5.4 Backend

- **No API changes** for Phase 1–2.
- Desktop app uses same `RJCloud` / `RJ_API_BASE_URL` as web.

---

## 6. Repository layout (proposed)

```text
desktop/
  package.json           # electron, electron-builder
  main.js                # window, permissions, loopback
  preload.js             # contextBridge → RJCaptureNative
  README.md              # dev run, build installer
public/                  # unchanged; loaded by file:// or dev server URL
docs/
  desktop-capture-implementation-plan.md   # this file
  silent-capture-plan.md                   # options summary
```

**Dev workflow**

- `npm run desktop:dev` — Electron loads `http://127.0.0.1:4175/app.html` or packaged `public/`.
- `npm run vercel:dev` in parallel for API (or production API URL in desktop `.env`).

---

## 7. Browser vs desktop product split

| SKU | Audience | Capture |
|-----|----------|---------|
| **Web** (current) | Try-before-install, close-talk, guest | mic, micRoom, system*, both* |
| **Desktop** (new) | Replace Zoom notes on PC | **native**, **bothNative** (+ micRoom fallback) |

\* system/both remain but documented as unreliable on Teams desktop Windows; desktop SKU de-emphasizes them.

**Marketing message:** “Install RJ Meeting Notes for Windows to capture Teams and Zoom desktop meetings — no share dialog, no copying Zoom transcripts.”

---

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| WASAPI loopback blocked or silent for some drivers | Spike early; device picker; fallback `micRoom` with clear status |
| Teams updates break capture | Test matrix Teams/Zoom versions; loopback is OS-level, lower risk than hooking Teams |
| Jabra + Zoom both running | Doc: close Zoom notes when using RJ; loopback captures system mix |
| Signing / SmartScreen warnings | Authenticode cert; first-run instructions |
| Scope creep (macOS before Win quality) | Phase 1 Windows-only ship |
| Duplicate codebase | Single `public/` UI; Electron is thin shell |

---

## 9. What stays in the browser (no desktop required)

- Landing, signup, login, admin (can open in browser).
- Close-talk quick notes.
- Separate-laptop acoustic secretary (`micRoom`).
- All AI notes, translate, Q&A, cloud save.

---

## 10. Immediate next actions

1. **Approve** this plan (scope + Phase 0 spike).
2. **Create** `desktop/` spike branch; 2–3 days engineering.
3. **Run** spike acceptance test (Teams recording, Zoom **closed**, compare Panel A to Zoom My Notes).
4. **Decide** loopback approach (§5.1) from spike data.
5. **Schedule** Phase 1 Windows MVP.

---

## 11. Related files (current codebase)

| File | Role |
|------|------|
| `public/capture.js` | Add `native` / `bothNative`; bridge to preload |
| `public/assemblyai-stream.js` | Consumer; PCM gain options |
| `public/app.js` | Capture selector, `buildAcquireStream`, routing |
| `public/hindi-recorder.js` | Same `acquireStream` pattern |
| `docs/help/meeting-notes-basics.md` | User-facing capture matrix |
| `docs/silent-capture-plan.md` | C-1/C-2/C-3 summary |

---

## 12. Open questions (decide in Phase 0)

1. **Distribution:** Direct download only vs Microsoft Store later?
2. **Offline:** Desktop required offline transcript buffer, or online-only v1?
3. **Branding:** “RJ Meeting Notes Desktop” vs same name as web?
4. **Free tier:** Same AssemblyAI gating as web multi-speaker?
5. **Auto-start with Windows** for secretary laptop?

---

*Last updated: May 2026 — incorporates debug session 81d54c findings.*
