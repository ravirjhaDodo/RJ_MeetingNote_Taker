# RJ Meeting Notes Taker Setup

Project folder:

```text
C:\Users\ravir\OneDrive\AI Projects\RJ_MeetingNote_Taker
```

See `PROJECT_CONTEXT.md` for the living project context. Update it whenever architecture, setup, services, ports, or major behavior changes.

## Services

- Firebase Auth for user sign-in.
- Firestore for saved meeting metadata and transcript segments.
- Firebase Functions for embeddings and Q&A.
- Qdrant Cloud for vector search.
- OpenAI API for embeddings and answers.

## Required local files

Create these files from the examples:

```text
public/firebase-config.local.js
.firebaserc
.env.local
functions/.env.local
```

Copy the browser config example:

```powershell
Copy-Item public\firebase-config.example.js public\firebase-config.local.js
```

## Environment variables

Frontend `.env.local`:

```text
OPENAI_API_KEY=created-securely-by-codex
```

Functions `functions/.env.local`:

```text
OPENAI_API_KEY=your-openai-api-key
QDRANT_URL=https://your-cluster-url
QDRANT_API_KEY=your-qdrant-api-key
QDRANT_COLLECTION=rj_meeting_notes
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_ANSWER_MODEL=gpt-4.1-mini
QDRANT_VECTOR_SIZE=1536
```

## Install

```powershell
npm install
npm run functions:install
```

## Run locally

```powershell
npm run serve
```

## Deploy

```powershell
firebase login
firebase use your-firebase-project-id
firebase deploy
```

## Notes

The current browser prototype still works without cloud setup. Cloud save and semantic Q&A become active once Firebase config, function env vars, and Qdrant credentials are added.
