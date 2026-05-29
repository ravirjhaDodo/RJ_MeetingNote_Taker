# Silent desktop capture (Option C) — technical summary

**Master plan (phases, acceptance criteria, timeline):** [`desktop-capture-implementation-plan.md`](desktop-capture-implementation-plan.md)

This document describes how to add **silent** meeting-audio capture (no per-session share prompt) to RJ Meeting Notes Taker. The browser implementation (`public/capture.js`) is the foundation; Option C adds a **`native`** source behind the same interface.

## Core principle

A pure website **cannot** silently capture another application's system audio. The OS treats that as a security boundary. Therefore:

| Approach | Install required? | Share prompt? | Captures remote participants (same machine) |
|----------|-------------------|---------------|---------------------------------------------|
| Browser — mic close-talk | No | Mic permission only | No (mic only) |
| Browser — mic room/passive | No | Mic permission only | Acoustically via speakers |
| Browser — meeting audio / both | No | One-time share tab/screen + audio per session | Yes (digital) |
| **Option C — silent loopback** | **Yes** | **No (after one-time OS permission)** | **Yes (digital)** |

## RJCapture interface (already implemented)

All capture paths return:

```js
{ stream: MediaStream, kind: string, release: () => void }
```

Current sources in `public/capture.js`:

- `mic` — close-talk microphone (echo/noise suppression on)
- `micRoom` — passive room listening (filters off)
- `system` — `getDisplayMedia` audio on this device
- `both` — mic + system mixed via `AudioContext`

Consumers (`assemblyai-stream.js`, `hindi-recorder.js`) accept an optional `acquireStream` callback. Adding Option C requires **one new source** in `RJCapture.acquire()` — no changes to transcription or UI beyond enabling a new selector option.

## Option C-1 — Desktop app (Electron) — RECOMMENDED

**User installs:** the RJ Meeting Notes desktop app (one-time).

**How it works:**

1. Electron shell loads the existing `public/` UI (or a packaged build).
2. A preload/main-process module exposes `RJCaptureNative.acquire()` that returns a `MediaStream` from OS loopback:
   - **Windows:** WASAPI loopback (`desktopCapturer` + `navigator.mediaDevices.getUserMedia` with `chromeMediaSource: 'desktop'` and audio constraints, or native Node addon).
   - **macOS:** ScreenCaptureKit / system audio capture with a **one-time** screen-recording permission in System Settings (not per meeting).
3. Register as `source: "native"` in `RJCapture.acquire()`.
4. UI adds a fifth capture option: **Silent — system audio (desktop app)**.

**Pros:** Best UX after install; works with Teams/Zoom desktop apps; no virtual cable setup.

**Cons:** Requires building, signing, and distributing Electron builds for Windows and macOS.

## Option C-2 — Virtual audio cable / loopback driver

**User installs:** VB-Audio Virtual Cable (Windows) or BlackHole (macOS), then routes meeting output through the virtual device.

**How it works:**

1. User sets Teams/Zoom output → virtual cable; sets RJ app input → virtual cable (or cable output as mic).
2. Browser `getUserMedia` selects the virtual device as the microphone.
3. Can use existing **`micRoom`** or **`mic`** path — no Electron required.

**Pros:** Cheapest to ship (documentation + UI hint only).

**Cons:** Fiddly setup; user must configure audio routing; quality depends on routing.

## Option C-3 — Browser extension

**User installs:** a Chrome/Edge extension with `tabCapture` permission.

**How it works:**

1. Extension captures a tab's audio without the share dialog.
2. Extension passes audio to the page via `MediaStream` bridge or offscreen document.
3. Registers as `native` or extends `system` source.

**Pros:** Lighter than full Electron.

**Cons:** Only works for **browser-tab** meetings (Zoom/Teams web), not desktop meeting apps; extension store review.

## Implementation checklist (when building C)

1. Add `native` to `RJCapture.SOURCES` and implement `acquireNative()` in main/preload.
2. Add UI option (disabled unless `RJCapture.nativeSupported()`).
3. Pass `acquireStream` the same way as `system`/`both` today.
4. Document install steps in `docs/help/meeting-notes-basics.md`.
5. No backend/API changes required.

## Separate-laptop secretary (Use case 2)

Option C loopback only captures audio on **the same machine** as the meeting app. A separate listening laptop still uses **`micRoom`** (acoustic capture). For perfect transcripts from a phone or another computer, use **Import Teams/Zoom transcript** (`.vtt` / `.txt`).

## Related files

| File | Role |
|------|------|
| `public/capture.js` | Capture source interface |
| `public/assemblyai-stream.js` | Streaming consumer |
| `public/hindi-recorder.js` | Chunked consumer |
| `public/app.js` | Capture source selector + routing |
| `public/transcript-import.js` | Post-meeting import fallback |
