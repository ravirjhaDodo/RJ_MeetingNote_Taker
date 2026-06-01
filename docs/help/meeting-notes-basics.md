# Meeting notes basics

## Panel B translation

In **Panel B**, set **Translated transcript language** to Hindi, Bengali, or another language, set **Speaker gender** for each person when shown, then press **Translate Panel B**. Sign in for reliable cloud translation. You can also set gender in the **Speakers** strip above; both stay in sync.

## Load a saved meeting

Use the dropdown under **Save to cloud** to open a saved meeting into the workspace. Choose a meeting title (not “All saved meetings”) to load its transcript and notes.

## Dual panels

- **Panel A (original):** speech as captured, in the source language.
- **Panel B (translated):** transcript in your **preferred language** (default English). Structured tags (decisions, actions, risks) apply here.

## Preferred language

Choose **Preferred language** in meeting controls or on your profile. Enable **Translate to preferred language** to update Panel B live.

## Ask during the meeting

Type questions in English. Local Q&A searches translated text first, then original text for names and untranslated terms.

## Multilingual Q&A {#multilingual-qa}

Cloud Q&A embeds translated segments. Questions in other languages are normalized to English before search when possible.

## New meeting vs continue

- **New meeting** clears the current workspace (transcript, speakers, generated notes, and meeting title) so you can capture a separate session. Listening stops if it was active. Use this when you want a blank slate before you press **Start listening**.
- **Start listening** with notes already on screen opens a choice: **Continue current meeting** (append to the same transcript) or **Start new meeting** (clear everything, then start listening immediately).
- **Clear** resets the workspace the same way as **New meeting**.

## Silence settings

Configure prompt and auto-stop minutes under listening settings. When auto-stop fires, you may be offered AI meeting notes if you are signed in with access.

## Multi-speaker mode

Enable **Multi-speaker (AssemblyAI)** to detect different voices automatically during live meetings. Each voice gets a label such as Speaker 1 or Speaker 2.

For English meetings, set **Expected speakers** close to the real number of active participants before starting. Use **Auto detect (up to 8)** when you genuinely do not know the count; AI will identify the speakers it hears up to that limit. A fixed count is usually steadier when you know the meeting size. This applies to all four capture sources: Close talk, Room listening, Meeting audio, and Both.

After stopping, the app automatically cleans short speaker-label flips for English Multi-speaker sessions. You can also press **Clean labels** in the Speakers panel, then rename Speaker 1 / Speaker 2 to real names.

The app can also infer names when someone says "I'm Ravi" or when another person is referenced in speech.

## Capture source (secretary modes)

Choose **Capture source** before **Start listening**:

| Option | When to use |
|--------|-------------|
| **Microphone — close talk** | In-person notes or you speaking near the mic. Uses browser speech or Multi-speaker when enabled. |
| **Microphone — room / passive listening** | Best web workaround for Teams/Zoom desktop or playback: set **input to the laptop microphone** and keep meeting **output on Jabra/speakers**. The laptop mic hears the room acoustically, echo cancellation is off, and Multi-speaker labels voices. Speaker labels may mix during overlaps; rename speakers after capture. |
| **Meeting audio — this device** | Meeting on **this computer** (browser tab or **desktop app** such as Teams). Captures audio digitally via a one-time share prompt. For the **Teams desktop app on Windows**, choose **Entire screen → the monitor** showing Teams and **Share system audio** (Window share often has no audio). Requires Multi-speaker. |
| **Both — mic + meeting audio** | Meeting on this computer plus your voice (e.g. USB speakerphone). Same share rules: **Entire screen** on the monitor where Teams plays, not Window. Requires Multi-speaker. |

Future **silent desktop capture** (no share prompt) is planned; see `docs/silent-capture-plan.md`.

### Recommended same-PC Teams/Zoom desktop setup

Use this when a prerecorded Teams/Zoom meeting or live desktop meeting is playing on the same Windows PC:

1. In Windows/Teams, set **speaker/output** to Jabra or external speakers.
2. Set **microphone/input** to the laptop microphone, not the Jabra mic.
3. In RJ Meeting Notes Taker, choose **Room listening — speakerphone / speakers**.
4. Enable **Multi-speaker**.
5. Turn speaker volume up enough for the laptop mic to hear clearly.
6. After capture, use **Clean labels** in the **Speakers** panel, then rename speakers if diarization still mixed a few turns.

This is an acoustic workaround, not true digital loopback. The planned desktop app will capture system audio directly for cleaner same-PC Teams/Zoom capture.

### Language recommendations for room listening

Based on local testing, use these settings:

| Meeting language | Recommended setting | What to expect |
|------------------|---------------------|----------------|
| English | **Room listening** + **English** + **Multi-speaker** | Best current web setup for same-PC Teams/Zoom playback. Speaker labels are usable but may still need cleanup. |
| English + Hindi / Hinglish | **Hindi** for live capture, or **Import Teams/Zoom transcript** after the meeting | Mixed live mode may capture English but miss Hindi from speaker playback. Hindi mode may catch both languages, but Hindi accuracy and speaker labels can be rough. |
| Hindi-heavy | **High-accuracy Hindi (pinned language)**, or transcript import | Better Hindi text quality. This mode is single-speaker live capture, so use the Speakers panel or import for speaker cleanup. |

No current browser-only mode gives perfect Hindi/Hinglish recognition plus perfect speaker diarization from room speaker playback. For important multilingual meetings, prefer platform transcript import or the future desktop loopback / recorded pass workflow.

## Import Teams/Zoom transcript

Under **Fallback capture**, use **Import Teams/Zoom transcript** to upload a `.vtt` or `.txt` file exported from Teams or Zoom. Speaker names and lines are loaded into Panel A so you can search, translate, and generate AI meeting notes.

Use import when live capture is incomplete (for example a meeting on another device) or when you want the platform's speaker labels.

## Mixed listen language (English, Hindi, Hinglish)

Choose **Mixed — English, Hindi, Hinglish** when speakers switch between English and Hindi in the same meeting (including Hinglish).

- The app tags each line as **en**, **hi**, or **hinglish** (or **other?** if another script is detected).
- This mode does **not** support Punjabi, Tamil, Spanish, Arabic, Chinese, or other languages — pick that language from the list instead.
- For English-only meetings, choose **English** (not Mixed) for best accuracy.
- For room-listening playback, Mixed mode is experimental and may miss Hindi speech; use Hindi mode, High-accuracy Hindi, or import when Hindi accuracy matters.

## High-accuracy Hindi (pinned language)

Use this when live capture drifts into Urdu/Persian script or wrong letters for Hindi speech.

1. Set **Listen language** to **Hindi** (not Mixed or English).
2. Turn on **High-accuracy Hindi (pinned language)**. This turns off live multi-speaker for that meeting.
3. Press **Start listening**. Draft segments appear in Panel A about every 40 seconds.
4. Press **Stop** for a full-accuracy pass (best quality) that replaces the draft segments.

Add speaker names in the **Speakers** panel before or during the meeting so the engine can recognize names like Harjeet more reliably.

This mode pins the language on the server (AssemblyAI pre-recorded API) so Hindi stays in Hindi script. It does not split speakers automatically—rename speakers in the **Speakers** panel if needed.

For live voice labels (Speaker A/B) with possible script drift, use **Multi-speaker** instead and leave high-accuracy off.

## Rename speakers

Use the **Speakers** panel or click any speaker pill in Panel A or Panel B to rename a speaker. Renaming updates every note for that speaker in the current meeting, including translated Panel B text and exports.
