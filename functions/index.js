import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import OpenAI from "openai";
import { QdrantClient } from "@qdrant/js-client-rest";

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const db = getFirestore();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

const COLLECTION = process.env.QDRANT_COLLECTION || "rj_meeting_notes";
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const ANSWER_MODEL = process.env.OPENAI_ANSWER_MODEL || "gpt-4.1-mini";
const VECTOR_SIZE = Number(process.env.QDRANT_VECTOR_SIZE || 1536);

function requireAuth(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in before saving or asking questions.");
  }
  return request.auth.uid;
}

async function ensureCollection() {
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((collection) => collection.name === COLLECTION);
  if (exists) return;

  await qdrant.createCollection(COLLECTION, {
    vectors: {
      size: VECTOR_SIZE,
      distance: "Cosine",
    },
  });
}

async function embedText(text) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

function normalizeSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new HttpsError("invalid-argument", "Provide at least one transcript segment.");
  }

  return segments.map((segment, index) => ({
    id: segment.id || randomUUID(),
    speaker: String(segment.speaker || "Speaker 1"),
    type: String(segment.type || "notes"),
    text: String(segment.text || "").trim(),
    timestamp: segment.timestamp || new Date().toISOString(),
    order: Number.isFinite(segment.order) ? segment.order : index,
  })).filter((segment) => segment.text);
}

export const saveMeeting = onCall(async (request) => {
  const uid = requireAuth(request);
  const { title = "Untitled meeting" } = request.data || {};
  const segments = normalizeSegments(request.data?.segments);

  await ensureCollection();

  const meetingRef = db.collection("users").doc(uid).collection("meetings").doc();
  const meetingId = meetingRef.id;
  const batch = db.batch();

  batch.set(meetingRef, {
    title,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    segmentCount: segments.length,
  });

  const points = [];
  for (const segment of segments) {
    const segmentRef = meetingRef.collection("segments").doc(segment.id);
    batch.set(segmentRef, segment);

    const vector = await embedText(`${segment.speaker}: ${segment.text}`);
    points.push({
      id: segment.id,
      vector,
      payload: {
        uid,
        meetingId,
        speaker: segment.speaker,
        type: segment.type,
        text: segment.text,
        timestamp: segment.timestamp,
        order: segment.order,
      },
    });
  }

  await batch.commit();
  await qdrant.upsert(COLLECTION, { wait: true, points });

  return { meetingId, segmentCount: segments.length };
});

export const askMeeting = onCall(async (request) => {
  const uid = requireAuth(request);
  const question = String(request.data?.question || "").trim();
  const meetingId = String(request.data?.meetingId || "").trim();

  if (!question) {
    throw new HttpsError("invalid-argument", "Provide a question.");
  }

  await ensureCollection();
  const vector = await embedText(question);
  const filter = {
    must: [
      { key: "uid", match: { value: uid } },
      ...(meetingId ? [{ key: "meetingId", match: { value: meetingId } }] : []),
    ],
  };

  const matches = await qdrant.search(COLLECTION, {
    vector,
    filter,
    limit: 8,
    with_payload: true,
  });

  const context = matches
    .map((match, index) => {
      const payload = match.payload || {};
      return `${index + 1}. [${payload.speaker || "Speaker 1"}] ${payload.text || ""}`;
    })
    .join("\n");

  const response = await openai.responses.create({
    model: ANSWER_MODEL,
    input: [
      {
        role: "system",
        content: "Answer using only the meeting transcript context. If the context does not contain the answer, say you do not have enough information.",
      },
      {
        role: "user",
        content: `Question: ${question}\n\nMeeting context:\n${context}`,
      },
    ],
  });

  return {
    answer: response.output_text,
    sources: matches.map((match) => ({
      score: match.score,
      speaker: match.payload?.speaker,
      text: match.payload?.text,
      timestamp: match.payload?.timestamp,
      meetingId: match.payload?.meetingId,
    })),
  };
});
