const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const state = {
  recognition: null,
  isListening: false,
  transcriptItems: [],
  liveText: "",
};

const els = {
  startButton: document.querySelector("#startButton"),
  stopButton: document.querySelector("#stopButton"),
  sampleButton: document.querySelector("#sampleButton"),
  clearButton: document.querySelector("#clearButton"),
  autoFormatToggle: document.querySelector("#autoFormatToggle"),
  speakerInput: document.querySelector("#speakerInput"),
  speakerList: document.querySelector("#speakerList"),
  listenLanguageSelect: document.querySelector("#listenLanguageSelect"),
  searchInput: document.querySelector("#searchInput"),
  micHelp: document.querySelector("#micHelp"),
  retryMicButton: document.querySelector("#retryMicButton"),
  manualTranscriptInput: document.querySelector("#manualTranscriptInput"),
  addManualButton: document.querySelector("#addManualButton"),
  liveTranscript: document.querySelector("#liveTranscript"),
  notesOutput: document.querySelector("#notesOutput"),
  insightsOutput: document.querySelector("#insightsOutput"),
  meetingStatus: document.querySelector("#meetingStatus"),
  statusDot: document.querySelector("#statusDot"),
  questionForm: document.querySelector("#questionForm"),
  questionInput: document.querySelector("#questionInput"),
  answerOutput: document.querySelector("#answerOutput"),
  translationTargetSelect: document.querySelector("#translationTargetSelect"),
  translateButton: document.querySelector("#translateButton"),
  translationOutput: document.querySelector("#translationOutput"),
  exportButtons: document.querySelectorAll("[data-export-format]"),
  emptyNotesTemplate: document.querySelector("#emptyNotesTemplate"),
  body: document.body,
};

const sampleLines = [
  { speaker: "Maya", text: "Maya opened with the launch timeline. The customer pilot is still planned for June tenth, and design needs final approval by Friday." },
  { speaker: "Jordan", text: "Decision: keep the onboarding flow to three steps for the first prototype and defer advanced preferences." },
  { speaker: "Ravi", text: "Action item for Ravi: send the revised pricing deck to finance by Tuesday." },
  { speaker: "Elena", text: "Important risk: transcription quality may be lower in noisy conference rooms, so the app should show confidence and let users edit notes." },
  { speaker: "Priya", text: "Priya asked whether sales can search prior meetings for objection patterns. Answer: yes, searchable notes are a requirement for the demo." },
  { speaker: "Maya", text: "Decision: highlight blockers in yellow and make owners bold so they are easy to scan after the meeting." },
  { speaker: "Elena", text: "Action item for Elena: schedule customer interviews and bring three quotes to the next product review." }
];

function setupRecognition() {
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = els.listenLanguageSelect.value;

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0].transcript.trim();
      if (result.isFinal) {
        addTranscriptItem(text, currentSpeaker());
      } else {
        interim += `${text} `;
      }
    }
    state.liveText = interim.trim();
    render();
  };

  recognition.onerror = (event) => {
    state.isListening = false;
    state.liveText = "";
    setStatus(readableMicError(event.error), false);
    showMicHelp(event.error === "not-allowed" || event.error === "service-not-allowed");
    render();
  };

  recognition.onend = () => {
    if (state.isListening) {
      recognition.start();
    }
  };

  return recognition;
}

function startListening() {
  if (!SpeechRecognition) {
    setStatus("Speech API unavailable", false);
    els.liveTranscript.textContent = "This browser does not expose the Web Speech API. Try Chrome or Edge on localhost, or use the sample meeting.";
    showMicHelp(true);
    return;
  }

  state.recognition = state.recognition || setupRecognition();
  state.recognition.lang = els.listenLanguageSelect.value;
  state.isListening = true;
  try {
    state.recognition.start();
    setStatus("Listening live", true);
    showMicHelp(false);
    render();
  } catch (error) {
    state.isListening = false;
    setStatus("Mic start failed", false);
    showMicHelp(true);
    els.liveTranscript.textContent = "Microphone access could not start. Use fallback capture below, or allow microphone access in the browser and try again.";
  }
}

function stopListening() {
  state.isListening = false;
  state.liveText = "";
  if (state.recognition) state.recognition.stop();
  setStatus("Paused", false);
  render();
}

function addTranscriptItem(text, speaker = currentSpeaker()) {
  if (!text) return;
  const parsed = parseSpeakerLine(text, speaker);
  const normalized = parsed.text.replace(/\s+/g, " ").trim();
  const resolvedSpeaker = parsed.speaker || defaultSpeaker();
  state.transcriptItems.push({
    id: crypto.randomUUID(),
    text: normalized,
    speaker: resolvedSpeaker,
    type: classifyText(normalized),
    timestamp: new Date(),
  });
  rememberSpeaker(resolvedSpeaker);
}

function classifyText(text) {
  const lower = text.toLowerCase();
  if (/\b(action item|follow up|todo|owner|by monday|by tuesday|by wednesday|by thursday|by friday|by next|due)\b/.test(lower)) return "actions";
  if (/\b(decision|decided|approved|agreed|we will|go with)\b/.test(lower)) return "decisions";
  if (/\b(risk|blocker|blocked|concern|issue|problem|important)\b/.test(lower)) return "risks";
  if (/\b(question|asked|whether|how do|what if|can we)\b/.test(lower)) return "questions";
  return "notes";
}

function render() {
  els.body.classList.toggle("is-listening", state.isListening);
  els.startButton.disabled = state.isListening;
  els.stopButton.disabled = !state.isListening;
  els.liveTranscript.textContent = state.liveText || lastTranscriptText() || (state.isListening
    ? "Listening for speech..."
    : "Start the app, allow microphone access, and this area will fill as people speak.");
  renderNotes();
  renderInsights();
}

function renderNotes() {
  const query = els.searchInput.value.trim();
  const items = state.transcriptItems.filter((item) => matchesQuery(`${item.speaker} ${item.text}`, query));
  els.notesOutput.innerHTML = "";

  if (!items.length) {
    els.notesOutput.appendChild(els.emptyNotesTemplate.content.cloneNode(true));
    return;
  }

  const sections = [
    ["decisions", "Decisions"],
    ["actions", "Action Items"],
    ["risks", "Risks & Highlights"],
    ["questions", "Open Questions"],
    ["notes", "Running Notes"],
  ];

  sections.forEach(([type, title]) => {
    const group = items.filter((item) => item.type === type);
    if (!group.length) return;

    const section = document.createElement("section");
    section.className = "note-section";
    section.innerHTML = `<h3>${title}</h3>`;

    const list = document.createElement("ul");
    list.className = "note-list";
    group.forEach((item) => {
      const li = document.createElement("li");
      const meta = document.createElement("span");
      meta.className = "note-meta";
      meta.textContent = formatTime(item.timestamp);
      li.appendChild(meta);
      const speaker = document.createElement("span");
      speaker.className = "speaker-pill";
      speaker.textContent = item.speaker || defaultSpeaker();
      li.appendChild(speaker);

      if (els.autoFormatToggle.checked) {
        li.appendChild(formatNote(item, query));
      } else {
        li.appendChild(document.createTextNode(item.text));
      }
      list.appendChild(li);
    });

    section.appendChild(list);
    els.notesOutput.appendChild(section);
  });
}

function formatNote(item, query) {
  const fragment = document.createDocumentFragment();
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = item.type === "actions" ? "OWNER" : item.type.toUpperCase();
  fragment.appendChild(tag);

  const strongOwner = item.text.replace(/\b(for|owner:?)\s+([A-Z][a-z]+)\b/g, "$1 **$2**");
  const highlighted = strongOwner.replace(/\b(risk|blocker|blocked|important|decision|action item|due|by Friday|by Tuesday)\b/gi, "==$1==");
  appendRichText(fragment, highlighted, query);
  return fragment;
}

function appendRichText(fragment, text, query) {
  const parts = text.split(/(\*\*[^*]+\*\*|==[^=]+==)/g).filter(Boolean);
  parts.forEach((part) => {
    let node;
    if (part.startsWith("**") && part.endsWith("**")) {
      node = document.createElement("strong");
      node.textContent = part.slice(2, -2);
    } else if (part.startsWith("==") && part.endsWith("==")) {
      node = document.createElement("mark");
      node.textContent = part.slice(2, -2);
    } else {
      node = document.createTextNode(part);
    }

    if (query && node.nodeType === Node.TEXT_NODE) {
      fragment.appendChild(highlightQuery(node.textContent, query));
    } else {
      fragment.appendChild(node);
    }
  });
}

function highlightQuery(text, query) {
  const fragment = document.createDocumentFragment();
  const terms = escapeRegExp(query).split(/\s+/).filter(Boolean);
  if (!terms.length) {
    fragment.appendChild(document.createTextNode(text));
    return fragment;
  }

  const regex = new RegExp(`(${terms.join("|")})`, "gi");
  text.split(regex).forEach((part) => {
    if (regex.test(part)) {
      const mark = document.createElement("mark");
      mark.textContent = part;
      fragment.appendChild(mark);
    } else {
      fragment.appendChild(document.createTextNode(part));
    }
    regex.lastIndex = 0;
  });
  return fragment;
}

function renderInsights() {
  const counts = state.transcriptItems.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {});

  const totalWords = state.transcriptItems.reduce((sum, item) => sum + item.text.split(/\s+/).length, 0);
  const speakerCount = new Set(state.transcriptItems.map((item) => item.speaker).filter(Boolean)).size;
  els.insightsOutput.innerHTML = "";
  [
    ["Captured", `${state.transcriptItems.length} notes`],
    ["Speakers", speakerCount],
    ["Words", totalWords.toLocaleString()],
    ["Decisions", counts.decisions || 0],
    ["Actions", counts.actions || 0],
    ["Risks", counts.risks || 0],
  ].forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "insight";
    row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    els.insightsOutput.appendChild(row);
  });
}

function answerQuestion(question) {
  const items = state.transcriptItems;
  if (!items.length) return "I do not have any meeting notes yet.";

  const ranked = items
    .map((item) => ({ item, score: scoreItem(item, question) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (!ranked.length) {
    return "I could not find a strong match yet. Try asking about decisions, action items, risks, owners, dates, or a keyword from the meeting.";
  }

  const topic = question.toLowerCase();
  const preferred = topic.includes("decision")
    ? ranked.filter((entry) => entry.item.type === "decisions")
    : topic.includes("action") || topic.includes("owner") || topic.includes("due")
      ? ranked.filter((entry) => entry.item.type === "actions")
      : ranked;

  const selected = preferred.length ? preferred : ranked;
  return selected.map(({ item }) => `<p><strong>${escapeHtml(item.speaker)} - ${formatType(item.type)}:</strong> ${escapeHtml(item.text)}</p>`).join("");
}

function scoreItem(item, question) {
  const words = tokenize(question);
  const text = `${item.speaker} ${item.text}`.toLowerCase();
  const typeBonus = question.toLowerCase().includes(item.type.slice(0, -1)) ? 3 : 0;
  return words.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0) + typeBonus;
}

function tokenize(text) {
  const stop = new Set(["the", "a", "an", "and", "or", "to", "for", "of", "we", "have", "has", "so", "far", "what", "who", "when", "is", "are"]);
  return text.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 2 && !stop.has(word)) || [];
}

function matchesQuery(text, query) {
  if (!query) return true;
  const terms = tokenize(query);
  if (!terms.length) return true;
  const lower = text.toLowerCase();
  return terms.every((term) => lower.includes(term));
}

function parseSpeakerLine(text, fallbackSpeaker) {
  const match = text.match(/^\s*([A-Z][A-Za-z .'-]{1,32}):\s+(.+)$/);
  if (!match) return { speaker: fallbackSpeaker || defaultSpeaker(), text };
  return { speaker: match[1].trim(), text: match[2].trim() };
}

function currentSpeaker() {
  return els.speakerInput.value.trim() || defaultSpeaker();
}

function defaultSpeaker() {
  return "Speaker 1";
}

function rememberSpeaker(speaker) {
  if (!speaker) return;
  const existing = Array.from(els.speakerList.options).some((option) => option.value === speaker);
  if (existing) return;
  const option = document.createElement("option");
  option.value = speaker;
  els.speakerList.appendChild(option);
}

async function translateNotes() {
  if (!state.transcriptItems.length) {
    els.translationOutput.textContent = "There are no notes to translate yet.";
    return;
  }

  const target = els.translationTargetSelect.value;
  const source = els.listenLanguageSelect.value.split("-")[0];
  const text = state.transcriptItems
    .map((item) => `${item.speaker}: ${item.text}`)
    .join("\n");

  if ("Translator" in window && typeof window.Translator?.create === "function") {
    try {
      const translator = await window.Translator.create({ sourceLanguage: source, targetLanguage: target });
      els.translationOutput.textContent = await translator.translate(text);
      setStatus("Translated", false);
      return;
    } catch (error) {
      els.translationOutput.textContent = translationFallbackMessage(target);
      setStatus("Translation unavailable", false);
      return;
    }
  }

  els.translationOutput.textContent = translationFallbackMessage(target);
  setStatus("Translation needs engine", false);
}

function translationFallbackMessage(target) {
  const language = els.translationTargetSelect.options[els.translationTargetSelect.selectedIndex].text;
  return `Translation to ${language} needs a translation engine. In production, this would call a multilingual transcription/translation service and keep both the original transcript and translated notes.`;
}

function exportTranscript(format) {
  if (!state.transcriptItems.length) {
    setStatus("Nothing to save yet", false);
    return;
  }

  const exportedAt = new Date();
  const filenameDate = exportedAt.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const formats = {
    txt: {
      mime: "text/plain",
      extension: "txt",
      content: buildPlainTextExport(exportedAt),
    },
    md: {
      mime: "text/markdown",
      extension: "md",
      content: buildMarkdownExport(exportedAt),
    },
    json: {
      mime: "application/json",
      extension: "json",
      content: JSON.stringify({
        title: "Live Meeting Notes",
        exportedAt: exportedAt.toISOString(),
        notes: state.transcriptItems.map((item) => ({
          id: item.id,
          speaker: item.speaker,
          type: item.type,
          text: item.text,
          timestamp: item.timestamp.toISOString(),
        })),
      }, null, 2),
    },
    doc: {
      mime: "application/msword",
      extension: "doc",
      content: buildWordExport(exportedAt),
    },
    srt: {
      mime: "application/x-subrip",
      extension: "srt",
      content: buildSrtExport(),
    },
  };

  const selected = formats[format];
  const blob = new Blob([selected.content], { type: selected.mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `meeting-notes-${filenameDate}.${selected.extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus(`Saved ${selected.extension.toUpperCase()}`, false);
}

function buildPlainTextExport(exportedAt) {
  return [
    "Live Meeting Notes",
    `Exported: ${exportedAt.toLocaleString()}`,
    "",
    ...state.transcriptItems.map((item) => `[${formatTime(item.timestamp)}] ${item.speaker} (${formatType(item.type)}): ${item.text}`),
    "",
  ].join("\n");
}

function buildMarkdownExport(exportedAt) {
  const sections = [
    ["decisions", "Decisions"],
    ["actions", "Action Items"],
    ["risks", "Risks & Highlights"],
    ["questions", "Open Questions"],
    ["notes", "Running Notes"],
  ];

  const lines = [
    "# Live Meeting Notes",
    "",
    `Exported: ${exportedAt.toLocaleString()}`,
    "",
  ];

  sections.forEach(([type, title]) => {
    const group = state.transcriptItems.filter((item) => item.type === type);
    if (!group.length) return;
    lines.push(`## ${title}`, "");
    group.forEach((item) => {
      lines.push(`- **${item.speaker}** (${formatTime(item.timestamp)}): ${item.text}`);
    });
    lines.push("");
  });

  return lines.join("\n");
}

function buildWordExport(exportedAt) {
  const sections = [
    ["decisions", "Decisions"],
    ["actions", "Action Items"],
    ["risks", "Risks & Highlights"],
    ["questions", "Open Questions"],
    ["notes", "Running Notes"],
  ];

  const body = sections.map(([type, title]) => {
    const group = state.transcriptItems.filter((item) => item.type === type);
    if (!group.length) return "";
    const items = group.map((item) => (
      `<li><strong>${escapeHtml(item.speaker)}</strong> (${escapeHtml(formatTime(item.timestamp))}): ${escapeHtml(item.text)}</li>`
    )).join("");
    return `<h2>${title}</h2><ul>${items}</ul>`;
  }).join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Live Meeting Notes</title>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.45; color: #18201c; }
      h1 { font-size: 24px; }
      h2 { font-size: 18px; color: #315c99; margin-top: 24px; }
      li { margin-bottom: 8px; }
    </style>
  </head>
  <body>
    <h1>Live Meeting Notes</h1>
    <p><strong>Exported:</strong> ${escapeHtml(exportedAt.toLocaleString())}</p>
    ${body}
  </body>
</html>`;
}

function buildSrtExport() {
  if (!state.transcriptItems.length) return "";
  const firstTimestamp = state.transcriptItems[0].timestamp.getTime();
  return state.transcriptItems.map((item, index) => {
    const startMs = Math.max(0, item.timestamp.getTime() - firstTimestamp);
    const next = state.transcriptItems[index + 1];
    const estimatedEndMs = startMs + Math.max(2500, Math.min(7000, item.text.split(/\s+/).length * 420));
    const endMs = next
      ? Math.max(startMs + 1200, Math.min(next.timestamp.getTime() - firstTimestamp - 150, estimatedEndMs))
      : estimatedEndMs;
    return [
      String(index + 1),
      `${formatSrtTime(startMs)} --> ${formatSrtTime(endMs)}`,
      `${item.speaker}: ${item.text}`,
      "",
    ].join("\n");
  }).join("\n");
}

function formatSrtTime(milliseconds) {
  const safeMs = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(safeMs / 3600000);
  const minutes = Math.floor((safeMs % 3600000) / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const ms = safeMs % 1000;
  return `${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)},${String(ms).padStart(3, "0")}`;
}

function padTime(value) {
  return String(value).padStart(2, "0");
}

function lastTranscriptText() {
  return state.transcriptItems.at(-1)?.text || "";
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatType(type) {
  return {
    decisions: "Decision",
    actions: "Action item",
    risks: "Risk or highlight",
    questions: "Question",
    notes: "Note",
  }[type];
}

function setStatus(text, live) {
  els.meetingStatus.textContent = text;
  els.statusDot.classList.toggle("is-live", live);
}

function showMicHelp(show) {
  els.micHelp.classList.toggle("is-hidden", !show);
}

function readableMicError(error) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Mic blocked: use fallback";
  }
  if (error === "no-speech") return "No speech detected";
  if (error === "audio-capture") return "No microphone found";
  return `Mic error: ${error}`;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

els.startButton.addEventListener("click", startListening);
els.retryMicButton.addEventListener("click", startListening);
els.stopButton.addEventListener("click", stopListening);
els.searchInput.addEventListener("input", renderNotes);
els.autoFormatToggle.addEventListener("change", renderNotes);
els.addManualButton.addEventListener("click", () => {
  const text = els.manualTranscriptInput.value.trim();
  if (!text) return;
  text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => addTranscriptItem(line, currentSpeaker()));
  els.manualTranscriptInput.value = "";
  setStatus("Fallback captured", false);
  render();
});
els.translateButton.addEventListener("click", translateNotes);
els.exportButtons.forEach((button) => {
  button.addEventListener("click", () => exportTranscript(button.dataset.exportFormat));
});
els.clearButton.addEventListener("click", () => {
  state.transcriptItems = [];
  state.liveText = "";
  els.answerOutput.textContent = "Answers will use the notes captured so far.";
  render();
});
els.sampleButton.addEventListener("click", () => {
  sampleLines.forEach((line) => addTranscriptItem(line.text, line.speaker));
  setStatus("Sample loaded", false);
  render();
});
els.questionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = els.questionInput.value.trim();
  if (!question) return;
  els.answerOutput.innerHTML = answerQuestion(question);
});

render();
