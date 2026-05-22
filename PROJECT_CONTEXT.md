# RJ Meeting Notes Taker Context

## Project Home

All project-related files should live under:

```text
C:\Users\ravir\OneDrive\AI Projects\RJ_MeetingNote_Taker
```

Future code, docs, configs, backend files, scripts, and generated project artifacts should be created or updated in this folder unless the user explicitly requests another location.

## Product Goal

RJ Meeting Notes Taker is a meeting note-taking prototype that can capture meeting speech, structure notes, support speaker labels, search notes, answer questions during or after the meeting, export transcripts, and later save/query meeting history through Firebase and Qdrant.

## Current Frontend

Location:

```text
public/
```

Core files:

- `public/index.html`
- `public/styles.css`
- `public/app.js`

Current capabilities:

- Start/stop browser-based speech recognition.
- Mic permission help prompt.
- Manual fallback capture.
- Speaker labels with default `Speaker 1`.
- Parsed speaker lines such as `Maya: ...`.
- Structured sections for decisions, action items, risks, questions, and notes.
- Search across note text and speakers.
- Local Q&A over captured notes.
- Translation UI placeholder.
- Exports: TXT, Markdown, JSON, Word-compatible `.doc`, and SRT.
- Firebase client wiring for Google sign-in when `public/firebase-config.local.js` is present.
- Cloud save button that calls the `saveMeeting` Firebase Function.
- Saved meeting list from Firestore for the signed-in user.
- Cloud Q&A toggle that calls the `askMeeting` Firebase Function and searches Qdrant-filtered saved notes.

## Backend Plan

Location:

```text
functions/
```

Current scaffold:

- Firebase Functions callable endpoint `saveMeeting`.
- Firebase Functions callable endpoint `askMeeting`.
- Firestore storage under `users/{uid}/meetings/{meetingId}`.
- Transcript segments under `users/{uid}/meetings/{meetingId}/segments/{segmentId}`.
- Qdrant vector collection default: `rj_meeting_notes`.
- OpenAI embeddings model default: `text-embedding-3-small`.
- OpenAI answer model default: `gpt-4.1-mini`.

## Services

- Firebase Auth: user login.
- Firestore: saved meetings and transcript segments.
- Firebase Functions: embeddings, saving, and Q&A.
- Qdrant Cloud: vector storage/search.
- OpenAI API: embeddings and grounded answers.

## Local Development

Preferred local app URL:

```text
http://127.0.0.1:4175
```

## Git

GitHub owner:

```text
ravirjhaDodo
```

GitHub repository:

```text
https://github.com/ravirjhaDodo/RJ_MeetingNote_Taker
```

Development branch:

```text
Dev1
```

The requested branch name `Dev 1` was changed to `Dev1` because Git branch names cannot contain spaces.

Static server command:

```powershell
python -m http.server 4175 --bind 127.0.0.1
```

Run from:

```text
C:\Users\ravir\OneDrive\AI Projects\RJ_MeetingNote_Taker\public
```

## Required Secrets

Do not commit secrets.

Expected local files:

- `.env.local`
- `functions/.env.local`
- `public/firebase-config.local.js`

Expected variables:

- `OPENAI_API_KEY`
- `QDRANT_URL`
- `QDRANT_API_KEY`
- `QDRANT_COLLECTION`
- `OPENAI_EMBEDDING_MODEL`
- `OPENAI_ANSWER_MODEL`
- `QDRANT_VECTOR_SIZE`

Public Firebase config file:

```text
public/firebase-config.local.js
```

Create it from:

```text
public/firebase-config.example.js
```

This file contains Firebase web app identifiers, not private service credentials.

## Update Rule

When project behavior, architecture, service choices, file structure, ports, setup steps, or environment variables change, update this context file in the same turn.
