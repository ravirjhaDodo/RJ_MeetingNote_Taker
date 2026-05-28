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

The app can also infer names when someone says "I'm Ravi" or when another person is referenced in speech.

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
