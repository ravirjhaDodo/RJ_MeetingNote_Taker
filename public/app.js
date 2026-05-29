const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const LISTEN_SETTINGS_STORAGE_KEY = "rjListenSettings";
const LISTEN_LANGUAGE_STORAGE_KEY = "rjListenLanguage";
const TRANSLATED_PANEL_STORAGE_KEY = "rjTranslatedPanelLanguage";
const MULTI_SPEAKER_STORAGE_KEY = "rjMultiSpeakerMode";
const HINDI_ACCURACY_STORAGE_KEY = "rjHindiAccuracyMode";
const ACTIVE_ROLE_STORAGE_KEY = "rjActiveRole";
const ROLE_LABELS = { admin: "Admin dashboard", user: "Meeting workspace" };
const ROLE_HOME_PAGES = { admin: "adminPage", user: "meetingPage" };
const TRANSLATED_PANEL_DEFAULT = "en";
/** Languages where Panel B shows per-speaker gender controls. */
const GENDERED_PANEL_LANGUAGES = new Set(["hi", "pa", "ta", "fr", "es", "ar", "mr", "bn", "gu"]);
const MIXED_DEFAULT_RECOGNITION_LANG = "en-US";
const TRANSLATION_CHUNK_SIZE = 320;
const TRANSLATION_RETRY_MS = 10000;
const TRANSLATION_MAX_RETRIES = 5;
const TRANSLATION_CALL_TIMEOUT_MS = 45000;
const RECOVERABLE_RECOGNITION_ERRORS = new Set(["no-speech", "aborted", "network"]);

const state = {
  recognition: null,
  assemblyAiStream: null,
  isListening: false,
  multiSpeakerMode: false,
  hindiAccuracyMode: false,
  hindiRecorder: null,
  hindiAccuracySessionActive: false,
  hindiChunkBusy: false,
  hindiChunkQueue: [],
  transcriptItems: [],
  speakerRegistry: {},
  speakerCounter: 0,
  speakerRenameHint: "",
  speakerRenameHintTimer: null,
  activeManualSpeakerId: null,
  liveText: "",
  liveOriginal: "",
  pendingTranslations: 0,
  activeRecognitionLang: MIXED_DEFAULT_RECOGNITION_LANG,
  lastSpeechAt: 0,
  inactivityTimer: null,
  recognitionRestartTimer: null,
  appliedRecognitionLang: "",
  continuePromptVisible: false,
  generatedNotesMarkdown: "",
  generatedNotesMode: "",
  lastCloudMeetingId: "",
  meetingStartedAt: null,
  activeRole: null,
};

const els = {
  startButton: document.querySelector("#startButton"),
  newMeetingButton: document.querySelector("#newMeetingButton"),
  stopButton: document.querySelector("#stopButton"),
  sampleButton: document.querySelector("#sampleButton"),
  clearButton: document.querySelector("#clearButton"),
  translatePanelBButton: document.querySelector("#translatePanelBButton"),
  autoFormatToggle: document.querySelector("#autoFormatToggle"),
  speakerInput: document.querySelector("#speakerInput"),
  speakerList: document.querySelector("#speakerList"),
  speakersPanel: document.querySelector("#speakersPanel"),
  speakersOutput: document.querySelector("#speakersOutput"),
  speakerRenameHint: document.querySelector("#speakerRenameHint"),
  multiSpeakerToggle: document.querySelector("#multiSpeakerToggle"),
  hindiAccuracyToggle: document.querySelector("#hindiAccuracyToggle"),
  hindiAccuracyHint: document.querySelector("#hindiAccuracyHint"),
  listenLanguageSelect: document.querySelector("#listenLanguageSelect"),
  autoTranslateToEnglishToggle: document.querySelector("#autoTranslateToEnglishToggle"),
  preferredLanguageSelect: document.querySelector("#preferredLanguageSelect"),
  panelBGenderControls: document.querySelector("#panelBGenderControls"),
  panelBGenderHint: document.querySelector("#panelBGenderHint"),
  createMeetingNotesButton: document.querySelector("#createMeetingNotesButton"),
  aiNotesActions: document.querySelector("#aiNotesActions"),
  aiNotesActionsHint: document.querySelector("#aiNotesActionsHint"),
  aiNotesDetailManualButton: document.querySelector("#aiNotesDetailManualButton"),
  aiNotesSummaryManualButton: document.querySelector("#aiNotesSummaryManualButton"),
  originalNotesOutput: document.querySelector("#originalNotesOutput"),
  generatedNotesSection: document.querySelector("#generatedNotesSection"),
  generatedNotesOutput: document.querySelector("#generatedNotesOutput"),
  copyNotesForWordButton: document.querySelector("#copyNotesForWordButton"),
  exportGeneratedMdButton: document.querySelector("#exportGeneratedMdButton"),
  exportGeneratedDocButton: document.querySelector("#exportGeneratedDocButton"),
  exportGeneratedPdfButton: document.querySelector("#exportGeneratedPdfButton"),
  aiNotesDialog: document.querySelector("#aiNotesDialog"),
  aiNotesDetailButton: document.querySelector("#aiNotesDetailButton"),
  aiNotesSummaryButton: document.querySelector("#aiNotesSummaryButton"),
  aiNotesDismissButton: document.querySelector("#aiNotesDismissButton"),
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
  signInLink: document.querySelector("#signInLink"),
  signOutButton: document.querySelector("#signOutButton"),
  cloudStatus: document.querySelector("#cloudStatus"),
  meetingTitleInput: document.querySelector("#meetingTitleInput"),
  saveCloudButton: document.querySelector("#saveCloudButton"),
  refreshMeetingsButton: document.querySelector("#refreshMeetingsButton"),
  savedMeetingSelect: document.querySelector("#savedMeetingSelect"),
  useCloudQuestionToggle: document.querySelector("#useCloudQuestionToggle"),
  translationTargetSelect: document.querySelector("#translationTargetSelect"),
  translateButton: document.querySelector("#translateButton"),
  translationOutput: document.querySelector("#translationOutput"),
  exportButtons: document.querySelectorAll("[data-export-format]"),
  emptyNotesTemplate: document.querySelector("#emptyNotesTemplate"),
  body: document.body,
  userAvatar: document.querySelector("#userAvatar"),
  userName: document.querySelector("#userName"),
  userMeta: document.querySelector("#userMeta"),
  roleSwitcherWrap: document.querySelector("#roleSwitcherWrap"),
  roleSwitcherSelect: document.querySelector("#roleSwitcherSelect"),
  adminNavButton: document.querySelector("#adminNavButton"),
  pageButtons: document.querySelectorAll("[data-page]"),
  pageSections: document.querySelectorAll(".page-section"),
  profileUserIdInput: document.querySelector("#profileUserIdInput"),
  profilePreferredLanguageSelect: document.querySelector("#profilePreferredLanguageSelect"),
  profileNameInput: document.querySelector("#profileNameInput"),
  avatarInput: document.querySelector("#avatarInput"),
  saveProfileButton: document.querySelector("#saveProfileButton"),
  newPasswordInput: document.querySelector("#newPasswordInput"),
  changePasswordButton: document.querySelector("#changePasswordButton"),
  apiProviderSelect: document.querySelector("#apiProviderSelect"),
  apiKeyLabelInput: document.querySelector("#apiKeyLabelInput"),
  apiEndpointInput: document.querySelector("#apiEndpointInput"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  saveApiKeyButton: document.querySelector("#saveApiKeyButton"),
  apiKeysOutput: document.querySelector("#apiKeysOutput"),
  refreshUsersButton: document.querySelector("#refreshUsersButton"),
  adminUsersOutput: document.querySelector("#adminUsersOutput"),
  adminUserSearch: document.querySelector("#adminUserSearch"),
  adminUserCount: document.querySelector("#adminUserCount"),
  promptAfterMinutesInput: document.querySelector("#promptAfterMinutesInput"),
  stopAfterMinutesInput: document.querySelector("#stopAfterMinutesInput"),
  saveListenSettingsButton: document.querySelector("#saveListenSettingsButton"),
  listenSettingsStatus: document.querySelector("#listenSettingsStatus"),
  continueListeningDialog: document.querySelector("#continueListeningDialog"),
  continueListeningMessage: document.querySelector("#continueListeningMessage"),
  continueListeningButton: document.querySelector("#continueListeningButton"),
  stopListeningNowButton: document.querySelector("#stopListeningNowButton"),
  startMeetingDialog: document.querySelector("#startMeetingDialog"),
  continueMeetingButton: document.querySelector("#continueMeetingButton"),
  startNewMeetingButton: document.querySelector("#startNewMeetingButton"),
  startMeetingCancelButton: document.querySelector("#startMeetingCancelButton"),
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
  recognition.lang = recognitionLanguageTag();

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0].transcript.trim();
      if (text) recordSpeechActivity();
      if (result.isFinal) {
        void addTranscriptItem(text, currentSpeaker());
      } else {
        interim += `${text} `;
      }
    }
    state.liveOriginal = interim.trim();
    updateLivePreview(interim.trim());
  };

  recognition.onerror = (event) => {
    if (state.isListening && RECOVERABLE_RECOGNITION_ERRORS.has(event.error)) {
      scheduleRecognitionRestart();
      if (event.error === "no-speech") {
        setStatus("Listening live (waiting for speech)", true);
      }
      return;
    }

    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      state.isListening = false;
      stopInactivityMonitor();
      hideContinuePrompt();
      state.liveText = "";
      state.liveOriginal = "";
      setStatus(readableMicError(event.error), false);
      showMicHelp(true);
      render();
      return;
    }

    setStatus(readableMicError(event.error), state.isListening);
  };

  recognition.onend = () => {
    if (!state.isListening) return;
    scheduleRecognitionRestart();
  };

  return recognition;
}

function scheduleRecognitionRestart() {
  if (!state.isListening || !state.recognition) return;
  if (state.recognitionRestartTimer) {
    window.clearTimeout(state.recognitionRestartTimer);
  }

  state.recognitionRestartTimer = window.setTimeout(() => {
    state.recognitionRestartTimer = null;
    if (!state.isListening || !state.recognition) return;
    try {
      state.recognition.start();
    } catch (error) {
      if (error?.name === "InvalidStateError") {
        state.recognitionRestartTimer = window.setTimeout(() => {
          state.recognitionRestartTimer = null;
          scheduleRecognitionRestart();
        }, 400);
        return;
      }
      console.warn("Recognition restart failed:", error);
    }
  }, 250);
}

function clearRecognitionRestartTimer() {
  if (state.recognitionRestartTimer) {
    window.clearTimeout(state.recognitionRestartTimer);
    state.recognitionRestartTimer = null;
  }
}

function recordSpeechActivity() {
  state.lastSpeechAt = Date.now();
  if (state.continuePromptVisible) {
    hideContinuePrompt();
    setStatus(listeningStatusLabel(), true);
  }
}

function listeningSettings() {
  const promptAfterMinutes = clampMinutes(els.promptAfterMinutesInput.value, 4);
  let stopAfterMinutes = clampMinutes(els.stopAfterMinutesInput.value, 5);
  if (stopAfterMinutes < promptAfterMinutes) {
    stopAfterMinutes = promptAfterMinutes + 1;
  }
  return { promptAfterMinutes, stopAfterMinutes };
}

function clampMinutes(value, fallback) {
  const minutes = Number.parseInt(String(value), 10);
  if (!Number.isFinite(minutes) || minutes < 1) return fallback;
  return Math.min(minutes, 180);
}

function loadListeningSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(LISTEN_SETTINGS_STORAGE_KEY) || "{}");
    if (saved.promptAfterMinutes) els.promptAfterMinutesInput.value = saved.promptAfterMinutes;
    if (saved.stopAfterMinutes) els.stopAfterMinutesInput.value = saved.stopAfterMinutes;
    const settings = listeningSettings();
    updateListenSettingsStatus(`Saved: prompt at ${settings.promptAfterMinutes} min, auto-stop at ${settings.stopAfterMinutes} min.`);
  } catch {
    updateListenSettingsStatus("Using default listening settings.");
  }
}

function saveListeningSettings() {
  const promptAfterMinutes = clampMinutes(els.promptAfterMinutesInput.value, 4);
  let stopAfterMinutes = clampMinutes(els.stopAfterMinutesInput.value, 5);
  if (stopAfterMinutes <= promptAfterMinutes) {
    stopAfterMinutes = promptAfterMinutes + 1;
    els.stopAfterMinutesInput.value = String(stopAfterMinutes);
  }

  els.promptAfterMinutesInput.value = String(promptAfterMinutes);
  localStorage.setItem(LISTEN_SETTINGS_STORAGE_KEY, JSON.stringify({
    promptAfterMinutes,
    stopAfterMinutes,
  }));
  updateListenSettingsStatus(`Saved: prompt at ${promptAfterMinutes} min, auto-stop at ${stopAfterMinutes} min.`);
}

function updateListenSettingsStatus(message) {
  if (els.listenSettingsStatus) {
    els.listenSettingsStatus.textContent = message;
  }
}

function startInactivityMonitor() {
  stopInactivityMonitor();
  state.lastSpeechAt = Date.now();
  state.inactivityTimer = window.setInterval(checkListeningInactivity, 15000);
}

function stopInactivityMonitor() {
  if (state.inactivityTimer) {
    window.clearInterval(state.inactivityTimer);
    state.inactivityTimer = null;
  }
}

function checkListeningInactivity() {
  if (!state.isListening) return;

  const settings = listeningSettings();
  const silentMs = Date.now() - state.lastSpeechAt;
  const promptMs = settings.promptAfterMinutes * 60 * 1000;
  const stopMs = settings.stopAfterMinutes * 60 * 1000;

  if (silentMs >= stopMs) {
    stopListening(`Stopped after ${settings.stopAfterMinutes} minutes of silence`);
    return;
  }

  if (silentMs >= promptMs) {
    const minutesLeft = Math.max(1, Math.ceil((stopMs - silentMs) / 60000));
    showContinuePrompt(settings, minutesLeft);
  }
}

function showContinuePrompt(settings, minutesLeft) {
  state.continuePromptVisible = true;
  els.continueListeningMessage.textContent = `No speech for ${settings.promptAfterMinutes} minutes. Keep listening, or listening will stop automatically in about ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`;
  els.continueListeningDialog.classList.remove("is-hidden");
  setStatus("Waiting for your response", true);
}

function hideContinuePrompt() {
  state.continuePromptVisible = false;
  els.continueListeningDialog.classList.add("is-hidden");
}

function continueListeningAfterPrompt() {
  recordSpeechActivity();
  hideContinuePrompt();
  if (state.isListening) {
    setStatus(listeningStatusLabel(), true);
    if (shouldUseAssemblyAi() || shouldUseHindiAccuracy()) return;
    scheduleRecognitionRestart();
  }
}

function showStartMeetingDialog() {
  els.startMeetingDialog.classList.remove("is-hidden");
}

function hideStartMeetingDialog() {
  els.startMeetingDialog.classList.add("is-hidden");
}

function beginNewMeeting() {
  if (state.isListening) {
    stopListening("Stopped", { offerAiNotes: false });
  }
  if (state.hindiRecorder) {
    void state.hindiRecorder.stop().catch(() => {});
    state.hindiRecorder = null;
  }
  state.hindiAccuracySessionActive = false;
  state.hindiChunkQueue = [];
  hideContinuePrompt();
  hideStartMeetingDialog();
  state.transcriptItems = [];
  state.speakerRegistry = {};
  state.speakerCounter = 0;
  state.activeManualSpeakerId = null;
  state.meetingStartedAt = null;
  state.lastCloudMeetingId = "";
  state.generatedNotesMarkdown = "";
  state.generatedNotesMode = "";
  state.liveText = "";
  state.liveOriginal = "";
  if (els.meetingTitleInput) els.meetingTitleInput.value = "";
  if (els.generatedNotesSection) els.generatedNotesSection.classList.add("is-hidden");
  if (els.generatedNotesOutput) els.generatedNotesOutput.textContent = "";
  if (els.answerOutput) els.answerOutput.textContent = "Answers will use the notes captured so far.";
  if (els.liveTranscript) els.liveTranscript.textContent = "";
  setStatus("New meeting ready", false);
  render();
}

function requestStartListening() {
  if (state.isListening) return;
  if (!state.transcriptItems.length) {
    startListening();
    return;
  }
  showStartMeetingDialog();
}

function startListening() {
  if (!state.meetingStartedAt) state.meetingStartedAt = new Date();
  if (shouldUseHindiAccuracy()) {
    void startHindiAccuracyListening();
    return;
  }
  if (shouldUseAssemblyAi()) {
    void startAssemblyAiListening();
    return;
  }

  if (!SpeechRecognition) {
    setStatus("Speech API unavailable", false);
    els.liveTranscript.textContent = "This browser does not expose the Web Speech API. Try Chrome or Edge on localhost, or use the sample meeting.";
    showMicHelp(true);
    return;
  }

  hideContinuePrompt();
  ensureRecognitionInstance();
  state.activeRecognitionLang = isMixedLanguageMode()
    ? MIXED_DEFAULT_RECOGNITION_LANG
    : els.listenLanguageSelect.value;
  state.isListening = true;
  clearRecognitionRestartTimer();
  startInactivityMonitor();

  try {
    state.recognition.start();
    setStatus(listeningStatusLabel(), true);
    showMicHelp(false);
    render();
  } catch (error) {
    if (error?.name === "InvalidStateError") {
      scheduleRecognitionRestart();
      setStatus(listeningStatusLabel(), true);
      showMicHelp(false);
      render();
      return;
    }

    state.isListening = false;
    stopInactivityMonitor();
    setStatus("Mic start failed", false);
    showMicHelp(true);
    els.liveTranscript.textContent = "Microphone access could not start. Use fallback capture below, or allow microphone access in the browser and try again.";
  }
}

function stopListening(statusMessage = "Paused", options = {}) {
  const wasListening = state.isListening;
  state.isListening = false;
  state.liveText = "";
  state.liveOriginal = "";
  stopInactivityMonitor();
  hideContinuePrompt();
  clearRecognitionRestartTimer();
  if (state.assemblyAiStream) {
    void state.assemblyAiStream.stop();
    state.assemblyAiStream = null;
  }
  const hindiRecorder = state.hindiRecorder;
  if (hindiRecorder) {
    state.hindiRecorder = null;
    state.hindiAccuracySessionActive = false;
    state.hindiChunkQueue = [];
    void finalizeHindiAccuracyStop(hindiRecorder, statusMessage, {
      wasListening,
      offerAiNotes: options.offerAiNotes,
    });
    return;
  }
  if (state.recognition) {
    try {
      state.recognition.stop();
    } catch (error) {
      console.warn("Recognition stop failed:", error);
    }
  }
  setStatus(statusMessage, false);
  render();
  if (options.offerAiNotes !== false && wasListening && state.transcriptItems.length) {
    maybeOfferAiNotes();
  }
}

function countScriptChars(text, pattern) {
  return (text.match(pattern) || []).length;
}

function analyzeTextScript(text) {
  const scores = {
    devanagari: countScriptChars(text, /[\u0900-\u097F]/g),
    gurmukhi: countScriptChars(text, /[\u0A00-\u0A7F]/g),
    latin: countScriptChars(text, /[A-Za-z]/g),
    arabic: countScriptChars(text, /[\u0600-\u06FF]/g),
    han: countScriptChars(text, /[\u4E00-\u9FFF]/g),
    tamil: countScriptChars(text, /[\u0B80-\u0BFF]/g),
  };

  const ranked = Object.entries(scores)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!ranked.length) {
    return { bcp47: MIXED_DEFAULT_RECOGNITION_LANG, iso: "en", script: "latin", uncertain: true };
  }

  const [topScript, topCount] = ranked[0];
  const secondCount = ranked[1]?.[1] || 0;
  const uncertain = secondCount > 0 && secondCount / topCount > 0.45;

  // Devanagari output while speaking English (common with hi-IN) — keep recognition on English.
  if (topScript === "devanagari" && scores.latin >= topCount * 0.3) {
    return { bcp47: "en-US", iso: "en", script: "latin", uncertain: true };
  }

  const bcp47ByScript = {
    devanagari: "hi-IN",
    gurmukhi: "pa-IN",
    latin: "en-US",
    arabic: "ar-SA",
    han: "zh-CN",
    tamil: "ta-IN",
  };

  const bcp47 = uncertain ? MIXED_DEFAULT_RECOGNITION_LANG : (bcp47ByScript[topScript] || MIXED_DEFAULT_RECOGNITION_LANG);
  return {
    bcp47,
    iso: bcp47.split("-")[0],
    script: topScript,
    uncertain,
  };
}

function tagMixedLanguageFromText(text) {
  return analyzeTextScript(text);
}

function ensureRecognitionInstance() {
  const lang = recognitionLanguageTag();
  if (state.recognition && state.appliedRecognitionLang !== lang) {
    try {
      state.recognition.stop();
    } catch (error) {
      console.warn("Recognition stop failed:", error);
    }
    state.recognition = null;
  }
  if (!state.recognition) {
    state.recognition = setupRecognition();
    state.appliedRecognitionLang = lang;
  }
  state.recognition.lang = lang;
  return state.recognition;
}

function resetRecognitionInstance() {
  if (state.recognition) {
    try {
      state.recognition.stop();
    } catch (error) {
      console.warn("Recognition stop failed:", error);
    }
  }
  state.recognition = null;
  state.appliedRecognitionLang = "";
}

async function addTranscriptItem(text, speakerHint = currentSpeaker(), options = {}) {
  if (!text) return;
  const parsed = parseSpeakerLine(text, speakerHint);
  const normalized = parsed.text.replace(/\s+/g, " ").trim();
  if (!normalized) return;

  let speakerId;
  let resolvedSpeaker;
  if (options.assemblyLabel) {
    speakerId = getOrCreateSpeaker(options.assemblyLabel);
    if (parsed.speaker && parsed.speaker !== speakerHint && parsed.speaker !== defaultSpeaker()) {
      speakerId = resolveManualSpeaker(parsed.speaker);
      resolvedSpeaker = parsed.speaker;
    } else {
      resolvedSpeaker = displaySpeaker({ speakerId });
    }
  } else if (parsed.speaker && parsed.speaker !== speakerHint && parsed.speaker !== defaultSpeaker()) {
    speakerId = resolveManualSpeaker(parsed.speaker);
    resolvedSpeaker = parsed.speaker;
  } else {
    speakerId = resolveManualSpeaker(speakerHint);
    resolvedSpeaker = displaySpeaker({ speakerId });
  }

  let captureLanguage = els.listenLanguageSelect.value;
  let scriptTag = "";
  if (isMixedLanguageMode()) {
    const analysis = tagMixedLanguageFromText(normalized);
    captureLanguage = "mixed";
    scriptTag = analysis.uncertain ? "mixed?" : analysis.iso;
  } else {
    captureLanguage = els.listenLanguageSelect.value;
  }

  const needsPanelTranslation = needsTranslation(normalized);
  const needsPanelBLater = !needsPanelTranslation && segmentNeedsPanelBTranslation(normalized);
  const item = {
    id: crypto.randomUUID(),
    originalText: normalized,
    text: (needsPanelTranslation || needsPanelBLater) ? "" : normalized,
    language: captureLanguage,
    scriptTag,
    speakerId,
    speaker: resolvedSpeaker,
    type: classifyText(normalized),
    timestamp: new Date(),
    translating: false,
    translationFailed: false,
    translationRetries: 0,
    panelBPending: needsPanelBLater,
    source: options.source || null,
    provisional: Boolean(options.provisional),
  };

  state.transcriptItems.push(item);
  rememberSpeaker(resolvedSpeaker);
  render();
  inferSpeakerNamesFromText(item);
  inferSpeakerGenderFromText(item);
  maybeInferSpeakerNamesViaCloud(item);

  if (!needsPanelTranslation) return;

  item.translating = true;
  state.pendingTranslations += 1;
  if (state.isListening) setStatus(`Translating to ${translatedPanelLanguageLabel()}...`, true);
  render();

  try {
    const translated = await withTranslationTimeout(
      translateText(normalized, translatedPanelLanguageCode(), { item }),
      TRANSLATION_CALL_TIMEOUT_MS,
    );
    if (translated) {
      item.text = translated;
      item.translationFailed = false;
      item.panelBPending = false;
      item.type = classifyText(item.text);
    } else {
      item.translationFailed = true;
      item.text = translationPendingLabel();
      scheduleTranslationRetry(item);
    }
  } catch (error) {
    console.warn("Translation failed:", error);
    item.translationFailed = true;
    item.text = translationPendingLabel();
    scheduleTranslationRetry(item);
  } finally {
    item.translating = false;
    state.pendingTranslations = Math.max(0, state.pendingTranslations - 1);
    if (state.isListening && !state.pendingTranslations) {
      setStatus(listeningStatusLabel(), true);
    }
    render();
  }
}

function classifyText(text) {
  const lower = text.toLowerCase();
  if (/\b(action item|follow up|todo|owner|by monday|by tuesday|by wednesday|by thursday|by friday|by next|due|कार्य|action:|acción|tarea)\b/.test(lower)) return "actions";
  if (/\b(decision|decided|approved|agreed|we will|go with|निर्णय|decisión|aprobado)\b/.test(lower)) return "decisions";
  if (/\b(risk|blocker|blocked|concern|issue|problem|important|जोखिम|riesgo|problema)\b/.test(lower)) return "risks";
  if (/\b(question|asked|whether|how do|what if|can we|सवाल|pregunta)\b/.test(lower)) return "questions";
  return "notes";
}

function isMixedLanguageMode() {
  return els.listenLanguageSelect.value === "mixed";
}

function recognitionLanguageTag() {
  if (isMixedLanguageMode()) {
    return state.activeRecognitionLang || MIXED_DEFAULT_RECOGNITION_LANG;
  }
  return els.listenLanguageSelect.value;
}

function currentListenLanguage() {
  if (isMixedLanguageMode()) {
    return state.activeRecognitionLang || "mixed";
  }
  return els.listenLanguageSelect.value;
}

function applyRecognitionLanguage() {
  ensureRecognitionInstance();
}

function listeningStatusLabel() {
  if (shouldUseHindiAccuracy()) {
    return `Listening (pinned ${listenLanguageToAssemblyCode()})`;
  }
  if (shouldUseAssemblyAi()) {
    return "Listening — AssemblyAI multi-speaker";
  }
  const option = els.listenLanguageSelect?.selectedOptions?.[0];
  const label = option?.textContent?.trim() || recognitionLanguageTag();
  if (isMixedLanguageMode()) {
    return `Listening (browser — mixed, English)`;
  }
  return `Listening (browser — ${label})`;
}

function panelBDisplayPending(item) {
  if (item.translating || item.translationFailed) return false;
  const original = item.originalText || "";
  if (!original) return false;
  if (item.text && item.text !== original && !/^\[/.test(item.text)) return false;
  return Boolean(item.panelBPending) || segmentNeedsPanelBTranslation(original, item);
}

/** Panel B / export: translated line only (never append original). */
function panelBText(item) {
  if (item.text && !panelBDisplayPending(item) && !item.translationFailed) {
    return item.text;
  }
  return "";
}

function displayOriginal() {
  return false;
}

/** Panel B — defaults to English until user changes the translated-language control. */
function translatedPanelLanguageCode() {
  return els.preferredLanguageSelect?.value
    || localStorage.getItem(TRANSLATED_PANEL_STORAGE_KEY)
    || TRANSLATED_PANEL_DEFAULT;
}

function translatedPanelLanguageLabel() {
  const option = els.preferredLanguageSelect?.selectedOptions?.[0];
  return option?.textContent || translatedPanelLanguageCode();
}

function panelBUsesGenderedGrammar() {
  const code = translatedPanelLanguageCode().split("-")[0].toLowerCase();
  return GENDERED_PANEL_LANGUAGES.has(code);
}

function createSpeakerGenderSelect(speakerId, entry) {
  const genderSelect = document.createElement("select");
  genderSelect.className = "speaker-row-gender";
  genderSelect.title = "Gender for translation grammar (e.g. Hindi verb forms)";
  genderSelect.dataset.speakerId = speakerId;
  [
    { value: "", label: "Auto" },
    { value: "female", label: "Female" },
    { value: "male", label: "Male" },
  ].forEach(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    if (entry.gender === value) option.selected = true;
    genderSelect.appendChild(option);
  });
  genderSelect.addEventListener("change", () => {
    const value = genderSelect.value;
    if (value === "male" || value === "female") {
      setSpeakerGender(speakerId, value, { lock: true });
    } else {
      const regEntry = state.speakerRegistry[speakerId];
      if (regEntry) {
        regEntry.genderLocked = false;
        regEntry.gender = null;
      }
    }
    renderSpeakersPanel();
    renderPanelBGenderControls();
  });
  return genderSelect;
}

function applySpeakerGenderFromControls(speakerId) {
  const input = els.speakersOutput?.querySelector(`input[data-speaker-id="${speakerId}"]`);
  const genderSelect = els.speakersOutput?.querySelector(`select[data-speaker-id="${speakerId}"]`)
    || els.panelBGenderControls?.querySelector(`select[data-speaker-id="${speakerId}"]`);
  const entry = state.speakerRegistry[speakerId];
  if (!entry) return false;
  let changed = false;
  const next = input?.value.trim();
  if (next && next !== entry.displayName) {
    renameSpeaker(speakerId, next, { userLocked: true });
    changed = true;
  }
  const genderValue = genderSelect?.value || "";
  if (genderValue === "male" || genderValue === "female") {
    setSpeakerGender(speakerId, genderValue, { lock: true });
    changed = true;
  } else if (entry.genderLocked) {
    entry.genderLocked = false;
    entry.gender = null;
    changed = true;
  }
  return changed;
}

function renderPanelBGenderControls() {
  if (!els.panelBGenderControls) return;
  const show = panelBUsesGenderedGrammar();
  els.panelBGenderControls.classList.toggle("is-hidden", !show);
  if (els.panelBGenderHint) els.panelBGenderHint.classList.toggle("is-hidden", !show);
  if (!show) return;

  const entries = Object.entries(state.speakerRegistry);
  els.panelBGenderControls.innerHTML = "";
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "helper-text";
    empty.textContent = "Speakers appear here as people talk (enable Multi-speaker for best results).";
    els.panelBGenderControls.appendChild(empty);
    return;
  }

  const label = document.createElement("span");
  label.className = "panel-b-gender-label";
  label.textContent = "Speaker gender:";
  els.panelBGenderControls.appendChild(label);

  entries.forEach(([speakerId, entry]) => {
    const chip = document.createElement("div");
    chip.className = "panel-b-speaker-gender";

    const name = document.createElement("span");
    name.className = "panel-b-speaker-name";
    name.textContent = entry.displayName;

    chip.appendChild(name);
    chip.appendChild(createSpeakerGenderSelect(speakerId, entry));
    els.panelBGenderControls.appendChild(chip);
  });
}

function loadPreferredLanguage() {
  const saved = localStorage.getItem(TRANSLATED_PANEL_STORAGE_KEY) || TRANSLATED_PANEL_DEFAULT;
  if (els.preferredLanguageSelect) els.preferredLanguageSelect.value = saved;
  if (els.profilePreferredLanguageSelect && els.profilePreferredLanguageSelect.value) {
    els.profilePreferredLanguageSelect.value = saved;
  }
}

function loadListenLanguage() {
  const saved = localStorage.getItem(LISTEN_LANGUAGE_STORAGE_KEY) || "en-US";
  if (els.listenLanguageSelect) {
    els.listenLanguageSelect.value = saved;
  }
  state.activeRecognitionLang = isMixedLanguageMode()
    ? MIXED_DEFAULT_RECOGNITION_LANG
    : (els.listenLanguageSelect?.value || "en-US");
}

function saveTranslatedPanelLanguage(code) {
  localStorage.setItem(TRANSLATED_PANEL_STORAGE_KEY, code);
  if (els.preferredLanguageSelect) els.preferredLanguageSelect.value = code;
}

function shouldAutoTranslate() {
  return els.autoTranslateToEnglishToggle.checked;
}

function segmentNeedsPanelBTranslation(text, item = null) {
  const original = String(item?.originalText ?? text ?? "").trim();
  if (!original) return false;
  const target = translatedPanelLanguageCode();
  if (target === "en") {
    if (!isLikelyEnglish(original)) {
      const current = String(item?.text ?? "").trim();
      if (!current || /^\[/.test(current) || item?.panelBPending || item?.translationFailed) return true;
      return !isLikelyEnglish(current);
    }
    const current = String(item?.text ?? "").trim();
    return !current || Boolean(item?.panelBPending);
  }
  if (isLikelyEnglish(original)) return true;
  return true;
}

function needsTranslation(text) {
  return shouldAutoTranslate() && segmentNeedsPanelBTranslation(text);
}

function panelBNotTranslatedLabel() {
  return `Not translated yet — use Translate Panel B (${translatedPanelLanguageLabel()})`;
}

function withTranslationTimeout(promise, timeoutMs = TRANSLATION_CALL_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("translation-timeout")), timeoutMs);
    }),
  ]);
}

function isLikelyEnglish(text) {
  const letters = text.match(/[^\s\d.,!?;:'"()\-]/gu) || [];
  if (!letters.length) return true;
  const nonLatin = letters.filter((char) => !/^[\u0000-\u024f]$/.test(char)).length;
  return nonLatin / letters.length < 0.12;
}

let livePreviewToken = 0;
let browserTranslateWarned = false;
const translationRetryTimers = new Map();

function translationPendingLabel() {
  return `[${translatedPanelLanguageLabel()} translation pending…]`;
}

function sourceLanguageForText(text) {
  const fromText = analyzeTextScript(text);
  if (!fromText.uncertain && fromText.iso) return fromText.iso;
  const selected = els.listenLanguageSelect.value;
  if (selected && selected !== "mixed") return selected.split("-")[0];
  return recognitionLanguageTag().split("-")[0];
}

function splitTranslationChunks(text, maxLen = TRANSLATION_CHUNK_SIZE) {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return [trimmed];

  const chunks = [];
  const sentences = trimmed.split(/(?<=[.!?。！？\u0964\u0965])\s+/u);
  let current = "";

  for (const part of sentences) {
    const candidate = current ? `${current} ${part}` : part;
    if (candidate.length <= maxLen) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (part.length <= maxLen) {
      current = part;
      continue;
    }
    for (let index = 0; index < part.length; index += maxLen) {
      chunks.push(part.slice(index, index + maxLen));
    }
    current = "";
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [trimmed];
}

function isRetriableTranslationError(error) {
  const message = String(error?.message || error?.code || error || "");
  return /deadline-exceeded|timeout|unavailable|resource-exhausted|internal/i.test(message);
}

function buildMeetingSpeakerRoster() {
  const seen = new Set();
  const roster = [];
  Object.values(state.speakerRegistry).forEach((entry) => {
    const name = String(entry.displayName || "").trim();
    const gender = entry.gender === "male" || entry.gender === "female" ? entry.gender : null;
    if (!name || !gender) return;
    const key = `${name.toLowerCase()}|${gender}`;
    if (seen.has(key)) return;
    seen.add(key);
    roster.push({ name, gender });
  });
  return roster;
}

function buildTranslationSpeakerContext(item) {
  if (!item?.speakerId) return null;
  const entry = state.speakerRegistry[item.speakerId];
  if (!entry) return null;
  return {
    name: entry.displayName,
    gender: entry.gender === "male" || entry.gender === "female" ? entry.gender : null,
  };
}

function setSpeakerGender(speakerId, gender, { lock = false } = {}) {
  const entry = state.speakerRegistry[speakerId];
  if (!entry || (entry.genderLocked && entry.gender && entry.gender !== gender)) return;
  if (gender !== "male" && gender !== "female") return;
  entry.gender = gender;
  if (lock) entry.genderLocked = true;
}

function setSpeakerGenderByName(name, gender, options = {}) {
  const speakerId = findSpeakerIdByDisplayName(name);
  if (!speakerId) return;
  setSpeakerGender(speakerId, gender, options);
}

async function translateViaCloud(text, targetLanguage, sourceLanguage, translationContext = {}) {
  const chunks = splitTranslationChunks(text);
  const parts = [];
  const meetingSpeakers = translationContext.meetingSpeakers || buildMeetingSpeakerRoster();
  const speakerContext = translationContext.speakerContext || null;

  for (const chunk of chunks) {
    let translated = "";
    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await window.RJCloud.translateTranscript({
          text: chunk,
          targetLanguage,
          sourceLanguage,
          speakerContext,
          meetingSpeakers,
        });
        if (result?.translation) {
          translated = result.translation;
          lastError = null;
          break;
        }
      } catch (error) {
        lastError = error;
        if (!isRetriableTranslationError(error)) throw error;
      }
    }

    if (lastError) throw lastError;
    parts.push(translated);
  }

  return parts.join(" ").trim();
}

async function translateText(text, targetLanguage, options = {}) {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (targetLanguage === "en" && isLikelyEnglish(trimmed)) return trimmed;

  const sourceLanguage = sourceLanguageForText(trimmed);
  const translationContext = {
    speakerContext: options.item ? buildTranslationSpeakerContext(options.item) : null,
    meetingSpeakers: buildMeetingSpeakerRoster(),
  };
  const allowCloudTranslate = targetLanguage === "en" || window.RJCloud.canUsePanelTranslation?.();
  const signedIn = Boolean(window.RJCloud?.user?.uid);
  const preferCloud = signedIn && allowCloudTranslate
    && (options.forceCloud || state.isListening || trimmed.length > 80);

  if (preferCloud) {
    try {
      const cloud = await translateViaCloud(trimmed, targetLanguage, sourceLanguage, translationContext);
      if (cloud) {
        return cloud;
      }
    } catch (error) {
      console.warn("Cloud translation failed:", error);
    }
  }

  const browserTranslation = await translateWithBrowser(trimmed, targetLanguage, sourceLanguage);
  if (browserTranslation) {
    return browserTranslation;
  }

  if (!preferCloud && signedIn && allowCloudTranslate) {
    try {
      const cloud = await translateViaCloud(trimmed, targetLanguage, sourceLanguage, translationContext);
      if (cloud) return cloud;
    } catch (error) {
      console.warn("Cloud translation failed:", error);
    }
  }

  return null;
}

async function translateWithBrowser(text, targetLanguage, sourceLanguage = sourceLanguageForText(text)) {
  if (!("Translator" in window) || typeof window.Translator?.availability !== "function") {
    return null;
  }

  try {
    const availability = await window.Translator.availability({
      sourceLanguage,
      targetLanguage,
    });
    if (availability !== "available") return null;
    if (typeof window.Translator?.create !== "function") return null;

    const translator = await window.Translator.create({
      sourceLanguage,
      targetLanguage,
    });
    return await translator.translate(text);
  } catch (error) {
    if (!browserTranslateWarned) {
      console.warn("Browser translation unavailable:", error);
      browserTranslateWarned = true;
    }
    return null;
  }
}

function scheduleTranslationRetry(item) {
  if (!item?.translationFailed || translationRetryTimers.has(item.id)) return;
  if ((item.translationRetries || 0) >= TRANSLATION_MAX_RETRIES) return;

  const timer = setTimeout(async () => {
    translationRetryTimers.delete(item.id);
    if (!item.translationFailed) return;

    item.translationRetries = (item.translationRetries || 0) + 1;
    item.translating = true;
    render();

    try {
      const translated = await withTranslationTimeout(
        translateText(item.originalText, translatedPanelLanguageCode(), { item }),
        TRANSLATION_CALL_TIMEOUT_MS,
      );
      if (translated) {
        item.text = translated;
        item.translationFailed = false;
        item.type = classifyText(item.text);
      } else {
        scheduleTranslationRetry(item);
      }
    } catch (error) {
      console.warn("Translation retry failed:", error);
      scheduleTranslationRetry(item);
    } finally {
      item.translating = false;
      render();
    }
  }, TRANSLATION_RETRY_MS);

  translationRetryTimers.set(item.id, timer);
}

function updateLivePreview(interimText) {
  state.liveText = interimText;
  void renderLiveTranscript(interimText);
}

async function renderLiveTranscript(interimText) {
  const token = ++livePreviewToken;
  const container = els.liveTranscript;
  if (!interimText) {
    if (token !== livePreviewToken) return;
    container.textContent = lastTranscriptPreview() || (state.isListening
      ? "Listening for speech..."
      : "Start the app, allow microphone access, and this area will fill as people speak. Non-English speech can be translated to English automatically.");
    return;
  }

  if (!shouldAutoTranslate() || !needsTranslation(interimText)) {
    if (token !== livePreviewToken) return;
    container.textContent = interimText;
    return;
  }

  container.innerHTML = `<span class="note-translating">Translating...</span>`;
  try {
    const translated = await translateText(interimText, translatedPanelLanguageCode());
    if (token !== livePreviewToken) return;
    if (translated) {
      container.textContent = translated;
    } else {
      container.textContent = translationPendingLabel();
    }
  } catch (error) {
    if (token !== livePreviewToken) return;
    container.textContent = interimText;
  }
}

function lastTranscriptPreview() {
  const last = state.transcriptItems.at(-1);
  if (!last) return "";
  return last.text || "";
}

function noteSearchText(item) {
  return `${displaySpeaker(item)} ${item.originalText || ""} ${item.text || ""}`;
}

function render() {
  els.body.classList.toggle("is-listening", state.isListening);
  els.startButton.disabled = state.isListening;
  els.stopButton.disabled = !state.isListening;
  if (!state.liveOriginal && !state.liveText) {
    els.liveTranscript.textContent = lastTranscriptPreview() || (state.isListening
      ? "Listening for speech..."
      : "Start the app, allow microphone access, and this area will fill as people speak. Non-English speech can be translated to English automatically.");
  }
  renderSpeakersPanel();
  renderPanelBGenderControls();
  renderOriginalNotes();
  renderNotes();
  renderInsights();
  renderCloudControls();
  renderUserChrome();
  renderAiNotesButton();
  renderMultiSpeakerControls();
  renderHindiAccuracyControls();
}

function profileIsAdmin(profile) {
  if (!profile) return false;
  if (Array.isArray(profile.roles) && profile.roles.includes("admin")) return true;
  return profile.role === "admin";
}

function profileRoles() {
  const profile = window.RJCloud?.profile;
  if (!profile) return [];
  if (Array.isArray(profile.roles) && profile.roles.length) {
    return [...new Set(profile.roles.filter((role) => role === "admin" || role === "user"))];
  }
  if (profile.role === "admin") return ["admin", "user"];
  return profile.role ? [profile.role] : [];
}

function resolveActiveRole() {
  const roles = profileRoles();
  if (!roles.length) return null;
  const stored = sessionStorage.getItem(ACTIVE_ROLE_STORAGE_KEY);
  if (stored && roles.includes(stored)) return stored;
  const initial = roles.includes("admin") ? "admin" : roles[0];
  sessionStorage.setItem(ACTIVE_ROLE_STORAGE_KEY, initial);
  return initial;
}

function isActiveRoleAdmin() {
  return state.activeRole === "admin";
}

function pageAllowedForActiveRole(pageId) {
  if (pageId === "adminPage") {
    return isActiveRoleAdmin() && profileRoles().includes("admin");
  }
  return true;
}

function applyActiveRoleView({ navigateHome = false } = {}) {
  const roles = profileRoles();
  const signedIn = Boolean(window.RJCloud?.user);

  if (!signedIn || roles.length <= 1) {
    if (els.roleSwitcherWrap) els.roleSwitcherWrap.classList.add("is-hidden");
    state.activeRole = roles[0] || null;
    els.adminNavButton.classList.toggle("is-hidden", !profileIsAdmin(window.RJCloud?.profile));
  } else {
    state.activeRole = resolveActiveRole();
    if (els.roleSwitcherWrap) els.roleSwitcherWrap.classList.remove("is-hidden");
    if (els.roleSwitcherSelect) {
      els.roleSwitcherSelect.innerHTML = roles
        .map((role) => `<option value="${role}">${ROLE_LABELS[role] || role}</option>`)
        .join("");
      els.roleSwitcherSelect.value = state.activeRole;
    }
    els.adminNavButton.classList.toggle("is-hidden", !isActiveRoleAdmin());
  }

  const currentPage = location.hash.replace("#", "") || "meetingPage";
  if (navigateHome && state.activeRole) {
    const home = ROLE_HOME_PAGES[state.activeRole] || "meetingPage";
    location.hash = home;
    renderPage(home);
    if (home === "adminPage") refreshAdminUsers();
    if (home === "profilePage") refreshApiKeys();
    return;
  }

  if (!pageAllowedForActiveRole(currentPage)) {
    const fallback = ROLE_HOME_PAGES[state.activeRole] || "meetingPage";
    location.hash = fallback;
    renderPage(fallback);
  } else {
    renderPage(currentPage);
  }
}

function setActiveRole(role) {
  if (!profileRoles().includes(role)) return;
  state.activeRole = role;
  sessionStorage.setItem(ACTIVE_ROLE_STORAGE_KEY, role);
  applyActiveRoleView({ navigateHome: true });
  renderUserChrome();
  renderCloudControls();
}

function renderPage(pageId = location.hash.replace("#", "") || "meetingPage") {
  let target = pageId || "meetingPage";
  if (!pageAllowedForActiveRole(target)) {
    target = ROLE_HOME_PAGES[state.activeRole] || "meetingPage";
    if (location.hash.replace("#", "") !== target) {
      location.hash = target;
    }
  }
  els.pageSections.forEach((section) => {
    section.classList.toggle("is-hidden", section.id !== target);
  });
}

function createSpeakerPill(item) {
  const speaker = document.createElement("button");
  speaker.type = "button";
  speaker.className = "speaker-pill speaker-pill-button";
  speaker.textContent = displaySpeaker(item);
  speaker.title = "Click to rename this speaker everywhere";
  speaker.dataset.speakerId = item.speakerId || "";
  speaker.addEventListener("click", () => promptRenameSpeaker(item.speakerId, displaySpeaker(item)));
  return speaker;
}

function renderOriginalNotes() {
  const query = els.searchInput.value.trim();
  const items = state.transcriptItems.filter((item) => matchesQuery(`${displaySpeaker(item)} ${item.originalText || item.text}`, query));
  els.originalNotesOutput.innerHTML = "";
  if (!items.length) {
    els.originalNotesOutput.appendChild(els.emptyNotesTemplate.content.cloneNode(true));
    return;
  }
  const list = document.createElement("ul");
  list.className = "note-list";
  items.forEach((item) => {
    const li = document.createElement("li");
    const meta = document.createElement("span");
    meta.className = "note-meta";
    meta.textContent = formatTime(item.timestamp);
    li.appendChild(meta);
    li.appendChild(createSpeakerPill(item));
    if (item.scriptTag) {
      const langPill = document.createElement("span");
      langPill.className = "speaker-pill lang-pill";
      langPill.textContent = item.scriptTag;
      li.appendChild(langPill);
    }
    li.appendChild(document.createTextNode(` ${item.originalText || item.text}`));
    list.appendChild(li);
  });
  els.originalNotesOutput.appendChild(list);
}

function renderNotes() {
  const query = els.searchInput.value.trim();
  const items = state.transcriptItems.filter((item) => matchesQuery(noteSearchText(item), query));
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
      li.appendChild(createSpeakerPill(item));

      if (els.autoFormatToggle.checked && !item.translating && !item.translationFailed && !panelBDisplayPending(item)) {
        li.appendChild(formatNote(item, query));
      } else if (item.translating) {
        li.appendChild(document.createTextNode(`Translating to ${translatedPanelLanguageLabel()}…`));
      } else if (item.translationFailed) {
        const failed = document.createElement("span");
        failed.className = "note-translation-pending";
        failed.textContent = item.text || translationPendingLabel();
        li.appendChild(failed);
      } else if (panelBDisplayPending(item)) {
        const pending = document.createElement("span");
        pending.className = "note-translation-pending";
        pending.textContent = panelBNotTranslatedLabel();
        li.appendChild(pending);
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
  const speakerCount = new Set(state.transcriptItems.map((item) => displaySpeaker(item)).filter(Boolean)).size;
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

function renderCloudControls() {
  const cloud = window.RJCloud;
  const ready = Boolean(cloud?.ready);
  const user = cloud?.user;
  const profile = cloud?.profile;
  const signedIn = Boolean(user);
  const usable = signedIn && (profileIsAdmin(profile) || profile?.status === "active");
  const canCloudSave = usable && cloud?.canUseFeature?.("cloudEmbeddings");
  const canCloudQA = usable && cloud?.canUseFeature?.("cloudQA");

  if (els.signInLink) {
    els.signInLink.classList.toggle("is-hidden", signedIn);
  }
  els.signOutButton.disabled = !ready || !signedIn;
  els.saveCloudButton.disabled = !ready || !canCloudSave || !state.transcriptItems.length;
  els.refreshMeetingsButton.disabled = !ready || !canCloudSave;
  els.savedMeetingSelect.disabled = !ready || !canCloudSave;
  els.useCloudQuestionToggle.disabled = !ready || !canCloudQA;

  if (!ready) {
    els.cloudStatus.innerHTML = 'Add public/firebase-config.js from the example to enable cloud features. <a href="help/do-i-need-an-account.html">Why sign in?</a>';
  } else if (!signedIn) {
    els.cloudStatus.innerHTML = 'Sign in to save meetings and use cloud Q&A. <a href="login.html">Log in</a> · <a href="help/do-i-need-an-account.html">Why sign in?</a>';
  } else if (!usable) {
    els.cloudStatus.textContent = `Signed in as ${profile?.userId || user.email}. Status: ${profile?.status || "pending admin approval"}.`;
  } else {
    els.cloudStatus.textContent = `Signed in as ${profile?.userId || profile?.displayName || user.email}. Plan: ${profile?.plan || "free"}.`;
  }
}

function aiNotesAccessState() {
  const cloud = window.RJCloud;
  const signedIn = Boolean(cloud?.user);
  const allowed = signedIn && cloud?.canUseFeature?.("aiMeetingNotes");
  const hasContent = state.transcriptItems.length > 0;
  const ready = hasContent && !state.isListening;
  return { signedIn, allowed, hasContent, ready };
}

function requestAiMeetingNotes(mode) {
  const { signedIn, allowed, hasContent, ready } = aiNotesAccessState();

  if (!hasContent) {
    setStatus("Capture some notes first", false);
    return;
  }
  if (state.isListening) {
    setStatus("Stop listening before generating meeting notes", false);
    return;
  }
  if (!signedIn) {
    window.location.href = "signup.html";
    return;
  }
  if (!allowed) {
    setStatus("AI meeting notes are not available on your account", false);
    return;
  }
  void generateAiMeetingNotes(mode);
}

function renderAiNotesButton() {
  const { signedIn, allowed, hasContent, ready } = aiNotesAccessState();
  const manualButtons = [els.aiNotesDetailManualButton, els.aiNotesSummaryManualButton].filter(Boolean);

  els.createMeetingNotesButton.disabled = !hasContent || state.isListening;
  els.createMeetingNotesButton.classList.toggle("is-locked", !signedIn || !allowed);

  if (els.aiNotesActions) {
    els.aiNotesActions.classList.toggle("is-hidden", !hasContent);
  }

  manualButtons.forEach((button) => {
    button.disabled = !ready || (signedIn && !allowed);
    button.classList.toggle("is-locked", !signedIn || (signedIn && !allowed));
  });

  if (els.aiNotesActionsHint) {
    if (!hasContent) {
      els.aiNotesActionsHint.textContent = "Capture notes first, then generate AI meeting notes here.";
    } else if (state.isListening) {
      els.aiNotesActionsHint.textContent = "Stop listening to unlock In detail and Summary.";
    } else if (!signedIn) {
      els.aiNotesActionsHint.innerHTML = 'Sign in to generate AI meeting notes. <a href="signup.html">Sign up</a> · <a href="login.html">Log in</a>';
    } else if (!allowed) {
      els.aiNotesActionsHint.textContent = "AI meeting notes trial ended — contact admin or upgrade.";
    } else {
      els.aiNotesActionsHint.textContent = "Choose full section-wise notes or a shorter summary.";
    }
  }

  if (!signedIn) {
    els.createMeetingNotesButton.title = "Sign up to generate AI meeting notes";
  } else if (!allowed) {
    els.createMeetingNotesButton.title = "AI meeting notes trial ended — contact admin or upgrade";
  } else if (state.isListening) {
    els.createMeetingNotesButton.title = "Stop listening to generate AI meeting notes";
  } else {
    els.createMeetingNotesButton.title = "Generate AI meeting notes (detail or summary)";
  }
}

function renderUserChrome() {
  const user = window.RJCloud?.user;
  const profile = window.RJCloud?.profile;
  const name = profile?.displayName || user?.displayName || "Guest";
  const userId = profile?.userId || "";
  const viewLabel = state.activeRole && ROLE_LABELS[state.activeRole]
    ? ROLE_LABELS[state.activeRole]
    : (profile?.role || "user");
  els.userName.textContent = name;
  els.userMeta.textContent = profile
    ? `${userId ? `@${userId}` : profile.contactEmail || ""} · ${viewLabel} · ${profile.status || "pending"}`
    : "Guest — local features only";
  els.userAvatar.src = profile?.photoURL || user?.photoURL || "";
  if (profile?.displayName && els.profileNameInput && !els.profileNameInput.value) {
    els.profileNameInput.value = profile.displayName;
  }
  if (profile?.userId && els.profileUserIdInput) {
    els.profileUserIdInput.value = profile.userId;
  }
}

function meetingTitle() {
  return els.meetingTitleInput.value.trim() || `Meeting ${new Date().toLocaleString()}`;
}

function serializedSegments() {
  return state.transcriptItems.map((item, index) => ({
    id: item.id,
    speakerId: item.speakerId || null,
    speaker: displaySpeaker(item),
    type: item.type,
    text: item.text,
    originalText: item.originalText || item.text,
    language: item.language || null,
    timestamp: item.timestamp.toISOString(),
    order: index,
  }));
}

async function saveCurrentMeetingToCloud() {
  if (!state.transcriptItems.length) {
    setStatus("Nothing to save yet", false);
    return;
  }

  try {
    setStatus("Saving cloud notes", false);
    const result = await window.RJCloud.saveMeeting({
      title: meetingTitle(),
      segments: serializedSegments(),
      meetingId: state.lastCloudMeetingId || undefined,
      generatedNotes: state.generatedNotesMarkdown
        ? { mode: state.generatedNotesMode, markdown: state.generatedNotesMarkdown, language: translatedPanelLanguageCode() }
        : undefined,
    });
    state.lastCloudMeetingId = result.meetingId;
    setStatus("Cloud saved", false);
    await refreshSavedMeetings(result.meetingId);
  } catch (error) {
    setStatus("Cloud save failed", false);
    els.cloudStatus.textContent = error.message || "Cloud save failed.";
  }
}

async function refreshSavedMeetings(selectedMeetingId = "") {
  try {
    const meetings = await window.RJCloud.listMeetings();
    els.savedMeetingSelect.innerHTML = "";

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = meetings.length ? "All saved meetings (Q&A filter only)" : "No saved meetings yet";
    els.savedMeetingSelect.appendChild(empty);

    meetings.forEach((meeting) => {
      const option = document.createElement("option");
      option.value = meeting.id;
      option.textContent = `${meeting.title || "Untitled meeting"} (${meeting.segmentCount || 0})`;
      els.savedMeetingSelect.appendChild(option);
    });

    els.savedMeetingSelect.value = selectedMeetingId;
    setStatus("Meetings refreshed", false);
  } catch (error) {
    setStatus("Refresh failed", false);
    els.cloudStatus.textContent = error.message || "Could not load saved meetings.";
  }
}

function importSegmentsFromCloud(segments) {
  state.speakerRegistry = {};
  state.speakerCounter = 0;
  state.activeManualSpeakerId = null;
  state.transcriptItems = segments.map((segment, index) => {
    const speakerName = String(segment.speaker || "Speaker 1").trim() || "Speaker 1";
    const speakerId = resolveManualSpeaker(speakerName);
    return {
      id: segment.id || crypto.randomUUID(),
      speakerId,
      speaker: speakerName,
      type: segment.type || "notes",
      text: segment.text || "",
      originalText: segment.originalText || segment.text || "",
      language: segment.language || null,
      timestamp: new Date(segment.timestamp || Date.now()),
      panelBPending: false,
      translating: false,
      translationFailed: false,
    };
  });
  if (state.transcriptItems.length) {
    state.meetingStartedAt = state.transcriptItems[0].timestamp;
  }
}

async function loadSavedMeeting(meetingId) {
  const id = String(meetingId || "").trim();
  if (!id) return;

  if (state.isListening) {
    stopListening("Stopped", { offerAiNotes: false });
  }

  try {
    setStatus("Loading saved meeting…", true);
    const payload = await window.RJCloud.getMeeting(id);
    const meeting = payload?.meeting;
    const segments = Array.isArray(payload?.segments) ? payload.segments : [];
    if (!meeting || !segments.length) {
      throw new Error("Saved meeting has no transcript segments.");
    }

    importSegmentsFromCloud(segments);
    state.lastCloudMeetingId = meeting.id;
    if (els.meetingTitleInput) {
      els.meetingTitleInput.value = meeting.title || "";
    }

    if (meeting.generatedNotes?.markdown) {
      state.generatedNotesMarkdown = meeting.generatedNotes.markdown;
      state.generatedNotesMode = meeting.generatedNotes.mode || "detail";
      if (els.generatedNotesSection) els.generatedNotesSection.classList.remove("is-hidden");
      renderGeneratedNotesMarkdown(state.generatedNotesMarkdown);
    } else {
      state.generatedNotesMarkdown = "";
      state.generatedNotesMode = "";
      if (els.generatedNotesSection) els.generatedNotesSection.classList.add("is-hidden");
      if (els.generatedNotesOutput) els.generatedNotesOutput.textContent = "";
    }

    render();
    setStatus(`Loaded: ${meeting.title || "Untitled meeting"}`, false);
    els.cloudStatus.textContent = `Loaded ${segments.length} segments from cloud.`;
  } catch (error) {
    setStatus("Load meeting failed", false);
    els.cloudStatus.textContent = error.message || "Could not load saved meeting.";
  }
}

async function refreshApiKeys() {
  try {
    const keys = await window.RJCloud.listUserApiKeys();
    await window.RJCloud.refreshAssemblyAiKeyStatus?.();
    renderMultiSpeakerControls();
    els.apiKeysOutput.innerHTML = keys.length
      ? keys.map((key) => `<p><strong>${escapeHtml(key.label || key.provider)}</strong> ${escapeHtml(key.provider)} key ending in ${escapeHtml(key.last4 || "****")} <button type="button" data-delete-key="${escapeHtml(key.id)}">Delete</button></p>`).join("")
      : "No saved API keys yet.";
  } catch (error) {
    els.apiKeysOutput.textContent = error.message || "Could not load API keys.";
  }
}

const ADMIN_FEATURE_KEYS = ["aiMeetingNotes", "cloudQA", "cloudEmbeddings", "autoTranslate", "speakerDiarization"];
const ADMIN_FEATURE_LABELS = {
  aiMeetingNotes: "AI notes",
  cloudQA: "Cloud Q&A",
  cloudEmbeddings: "Cloud save",
  autoTranslate: "Auto-translate",
  speakerDiarization: "Diarization",
};

function adminStatusTone(status) {
  switch (String(status || "").toLowerCase()) {
    case "active": return "ok";
    case "pending": return "warn";
    case "paused": return "muted";
    case "rejected":
    case "revoked": return "danger";
    default: return "muted";
  }
}

function adminFeatureTone(feature) {
  if (!feature) return "muted";
  const status = String(feature.status || "").toLowerCase();
  if (status === "active") {
    if (feature.expiresAt && new Date(feature.expiresAt) < new Date()) return "danger";
    return "ok";
  }
  if (status === "paused") return "muted";
  if (status === "expired") return "danger";
  return "muted";
}

function adminBadge(text, tone) {
  return `<span class="admin-badge admin-badge--${tone}">${escapeHtml(text)}</span>`;
}

function adminInitials(user) {
  const base = String(user.displayName || user.userId || user.email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : base.slice(0, 2);
  return letters.toUpperCase();
}

function adminFeatureStatusText(feature) {
  if (!feature) return "not set";
  const exp = feature.expiresAt ? ` · until ${new Date(feature.expiresAt).toLocaleDateString()}` : "";
  return `${feature.status}${exp}`;
}

function renderAdminUserCard(user) {
  const roles = (user.roles || [user.role]).filter(Boolean);
  const roleText = roles.join(", ") || user.role || "user";
  const plan = user.plan || "free";
  const status = user.status || "unknown";
  const searchBlob = [user.displayName, user.userId, user.contactEmail, user.email]
    .filter(Boolean).join(" ").toLowerCase();

  const featureRows = ADMIN_FEATURE_KEYS.map((key) => {
    const feature = user.features?.[key];
    return `
      <div class="admin-feature" data-feature-key="${key}">
        <span class="admin-feature__name">${escapeHtml(ADMIN_FEATURE_LABELS[key] || key)}</span>
        ${adminBadge(adminFeatureStatusText(feature), adminFeatureTone(feature))}
        <span class="admin-feature__duration">
          <input type="number" min="1" value="7" data-feature-amount aria-label="${escapeHtml(key)} amount">
          <select data-feature-unit aria-label="${escapeHtml(key)} unit">
            <option value="days">days</option>
            <option value="weeks">weeks</option>
            <option value="months">months</option>
            <option value="years">years</option>
          </select>
        </span>
        <span class="admin-feature__actions">
          <button type="button" class="admin-btn admin-btn--primary" data-admin-action="extendFeature">Extend</button>
          <button type="button" class="admin-btn" data-admin-action="pauseFeature">Pause</button>
          <button type="button" class="admin-btn" data-admin-action="resumeFeature">Resume</button>
        </span>
      </div>`;
  }).join("");

  return `
    <article class="admin-card" data-admin-user="${escapeHtml(user.uid)}" data-search="${escapeHtml(searchBlob)}">
      <header class="admin-card__head">
        <span class="admin-card__avatar" aria-hidden="true">${escapeHtml(adminInitials(user))}</span>
        <div class="admin-card__id">
          <strong>${escapeHtml(user.displayName || user.userId || user.uid)}</strong>
          <span class="admin-card__meta">@${escapeHtml(user.userId || "—")} · ${escapeHtml(user.contactEmail || user.email || "no email")}</span>
        </div>
        <div class="admin-card__badges">
          ${adminBadge(status, adminStatusTone(status))}
          ${adminBadge(roleText, roles.includes("admin") ? "info" : "muted")}
          ${adminBadge(`plan: ${plan}`, "neutral")}
        </div>
      </header>

      <div class="admin-card__section">
        <span class="admin-card__label">Account</span>
        <div class="admin-btn-group">
          <button type="button" class="admin-btn admin-btn--primary" data-admin-action="approve">Approve</button>
          <button type="button" class="admin-btn" data-admin-action="pause">Pause</button>
          <button type="button" class="admin-btn admin-btn--danger" data-admin-action="reject">Reject</button>
          <button type="button" class="admin-btn admin-btn--danger" data-admin-action="revoke">Revoke</button>
          <button type="button" class="admin-btn" data-admin-action="makeAdmin">Make admin</button>
          <button type="button" class="admin-btn" data-admin-action="makeUser">Make user</button>
          <button type="button" class="admin-btn" data-admin-action="guest">Guest 10d</button>
          <button type="button" class="admin-btn" data-admin-action="stopGuest">Stop guest</button>
          <button type="button" class="admin-btn" data-admin-temp="true">Temp password</button>
        </div>
      </div>

      <div class="admin-card__section">
        <span class="admin-card__label">Details</span>
        <div class="admin-details">
          <input type="text" class="admin-input" data-edit-firstname value="${escapeHtml(user.firstName || "")}" placeholder="First name" aria-label="First name">
          <input type="text" class="admin-input" data-edit-lastname value="${escapeHtml(user.lastName || "")}" placeholder="Last name" aria-label="Last name">
          <input type="email" class="admin-input admin-input--wide" data-edit-email value="${escapeHtml(user.contactEmail || "")}" placeholder="Contact email" aria-label="Contact email">
          <button type="button" class="admin-btn admin-btn--primary" data-admin-action="updateDetails">Save details</button>
        </div>
      </div>

      <div class="admin-card__section">
        <span class="admin-card__label">Plan</span>
        <div class="admin-inline">
          <select data-admin-plan aria-label="Plan">
            <option value="free" ${plan === "free" ? "selected" : ""}>free</option>
            <option value="paid" ${plan === "paid" ? "selected" : ""}>paid</option>
            <option value="byok" ${plan === "byok" ? "selected" : ""}>byok</option>
          </select>
          <button type="button" class="admin-btn admin-btn--primary" data-admin-action="setPlan">Set plan</button>
        </div>
      </div>

      <div class="admin-card__section">
        <span class="admin-card__label">Features</span>
        <div class="admin-feature-table">${featureRows}</div>
      </div>

      <div class="admin-card__section admin-card__section--danger">
        <span class="admin-card__label">Danger zone</span>
        <div class="admin-btn-group">
          <button type="button" class="admin-btn admin-btn--danger" data-admin-action="deleteUser" data-user-label="${escapeHtml(user.displayName || user.userId || user.uid)}">Delete user</button>
        </div>
      </div>
    </article>`;
}

function applyAdminUserFilter() {
  const query = String(els.adminUserSearch?.value || "").trim().toLowerCase();
  const cards = els.adminUsersOutput.querySelectorAll(".admin-card");
  let visible = 0;
  cards.forEach((card) => {
    const match = !query || (card.dataset.search || "").includes(query);
    card.classList.toggle("is-hidden", !match);
    if (match) visible += 1;
  });
  if (els.adminUserCount) {
    els.adminUserCount.textContent = query
      ? `${visible} of ${cards.length} users`
      : `${cards.length} user${cards.length === 1 ? "" : "s"}`;
  }
}

async function refreshAdminUsers() {
  const scrollY = window.scrollY;
  const restoreScroll = () => window.scrollTo({ top: scrollY });
  try {
    if (!els.adminUsersOutput.children.length) {
      els.adminUsersOutput.innerHTML = `<p class="admin-empty">Loading users…</p>`;
    }
    const users = await window.RJCloud.listUsers();
    if (!users.length) {
      els.adminUsersOutput.innerHTML = `<p class="admin-empty">No users yet.</p>`;
      if (els.adminUserCount) els.adminUserCount.textContent = "0 users";
      return;
    }
    els.adminUsersOutput.innerHTML = users.map(renderAdminUserCard).join("");
    applyAdminUserFilter();
    restoreScroll();
  } catch (error) {
    els.adminUsersOutput.innerHTML = `<p class="admin-empty admin-empty--error">${escapeHtml(error.message || "Could not load users.")}</p>`;
  }
}

function questionMatchesWord(topic, word) {
  const escaped = String(word || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}`, "i").test(topic);
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
  const preferred = questionMatchesWord(topic, "decision")
    ? ranked.filter((entry) => entry.item.type === "decisions")
    : questionMatchesWord(topic, "action") || questionMatchesWord(topic, "owner")
      || questionMatchesWord(topic, "due")
      ? ranked.filter((entry) => entry.item.type === "actions")
      : ranked;

  const selected = preferred.length ? preferred : ranked;
  return selected.map(({ item }) => {
    const line = panelBText(item) || item.originalText || item.text;
    return `<p><strong>${escapeHtml(displaySpeaker(item))} - ${formatType(item.type)}:</strong> ${escapeHtml(line)}</p>`;
  }).join("");
}

function scoreItem(item, question) {
  const words = tokenize(question);
  const original = String(item.originalText || "").toLowerCase();
  const translated = String(item.text || "").toLowerCase();
  const combined = `${original} ${translated} ${displaySpeaker(item).toLowerCase()}`;
  if (!words.length) return 0;

  let score = 0;
  for (const word of words) {
    if (combined.includes(word)) score += 1;
  }

  const topic = question.toLowerCase();
  if (/\b(check|verify|test|see|capture|hindi|language|wanted|goal|purpose)\b/i.test(topic)) {
    const intentTerms = ["check", "checking", "see", "capture", "capturing", "hindi", "language", "transcript", "wanted", "test", "verify"];
    for (const term of intentTerms) {
      if (combined.includes(term)) score += 1;
    }
  }

  const typeBonus = questionMatchesWord(topic, item.type.slice(0, -1)) ? 3 : 0;
  return score + typeBonus;
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

function defaultDisplayNameForLabel(assemblyLabel) {
  const label = String(assemblyLabel || "").trim();
  if (!label || label === "UNKNOWN") return "Unidentified voice";
  if (/^[A-Z]$/.test(label)) return `Speaker ${label.charCodeAt(0) - 64}`;
  return label;
}

function findSpeakerIdByAssemblyLabel(label) {
  return Object.entries(state.speakerRegistry).find(([, entry]) => entry.assemblyLabel === label)?.[0] || null;
}

function findSpeakerIdByDisplayName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) return null;
  return Object.entries(state.speakerRegistry).find(([, entry]) => entry.displayName.trim().toLowerCase() === normalized)?.[0] || null;
}

function getOrCreateSpeaker(assemblyLabel) {
  const label = assemblyLabel || "UNKNOWN";
  const existingId = findSpeakerIdByAssemblyLabel(label);
  if (existingId) return existingId;

  state.speakerCounter += 1;
  const speakerId = `spk_${label}_${state.speakerCounter}`;
  const displayName = defaultDisplayNameForLabel(label);
  state.speakerRegistry[speakerId] = {
    assemblyLabel: label,
    displayName,
    inferredFrom: null,
    userLocked: false,
    gender: null,
    genderLocked: false,
  };
  rememberSpeaker(displayName);
  return speakerId;
}

function resolveManualSpeaker(displayName) {
  const name = String(displayName || defaultSpeaker()).trim() || defaultSpeaker();
  const existingId = findSpeakerIdByDisplayName(name);
  if (existingId) return existingId;

  if (/^Speaker \d+$/i.test(name) && state.activeManualSpeakerId && state.speakerRegistry[state.activeManualSpeakerId]) {
    return state.activeManualSpeakerId;
  }

  state.speakerCounter += 1;
  const speakerId = `spk_manual_${state.speakerCounter}`;
  state.speakerRegistry[speakerId] = {
    assemblyLabel: "manual",
    displayName: name,
    inferredFrom: null,
    userLocked: false,
    gender: null,
    genderLocked: false,
  };
  if (/^Speaker \d+$/i.test(name)) state.activeManualSpeakerId = speakerId;
  rememberSpeaker(name);
  return speakerId;
}

function displaySpeaker(item) {
  if (item?.speakerId && state.speakerRegistry[item.speakerId]) {
    return state.speakerRegistry[item.speakerId].displayName;
  }
  return item?.speaker || defaultSpeaker();
}

function renameSpeaker(speakerId, newName, { userLocked = true } = {}) {
  const trimmed = String(newName || "").trim();
  const entry = state.speakerRegistry[speakerId];
  if (!trimmed || !entry) return false;

  entry.displayName = trimmed;
  if (userLocked) entry.userLocked = true;

  state.transcriptItems.forEach((item) => {
    if (item.speakerId === speakerId) item.speaker = trimmed;
  });

  rememberSpeaker(trimmed);
  render();
  return true;
}

function promptRenameSpeaker(speakerId, currentName) {
  if (!speakerId) {
    const fallbackId = resolveManualSpeaker(currentName);
    speakerId = fallbackId;
  }
  const nextName = window.prompt("Rename speaker (updates all notes for this speaker):", currentName || defaultSpeaker());
  if (!nextName) return;
  const trimmed = nextName.trim();
  if (!trimmed || trimmed === currentName) return;
  renameSpeaker(speakerId, trimmed, { userLocked: true });
  showSpeakerRenameHint(`Renamed ${currentName} → ${trimmed}`);
}

function showSpeakerRenameHint(message) {
  state.speakerRenameHint = message;
  if (els.speakerRenameHint) els.speakerRenameHint.textContent = message;
  if (state.speakerRenameHintTimer) clearTimeout(state.speakerRenameHintTimer);
  state.speakerRenameHintTimer = setTimeout(() => {
    state.speakerRenameHint = "";
    if (els.speakerRenameHint) els.speakerRenameHint.textContent = "";
  }, 6000);
}

function renderSpeakersPanel() {
  if (!els.speakersOutput) return;
  const entries = Object.entries(state.speakerRegistry);
  if (!entries.length) {
    els.speakersOutput.innerHTML = "<p class=\"helper-text\">Speakers appear here as people talk. Click a name to rename everyone with that label.</p>";
    return;
  }

  els.speakersOutput.innerHTML = "";
  entries.forEach(([speakerId, entry]) => {
    const row = document.createElement("div");
    row.className = "speaker-row";

    const label = document.createElement("span");
    label.className = "speaker-row-label";
    label.textContent = entry.assemblyLabel && entry.assemblyLabel !== "manual"
      ? `Voice ${entry.assemblyLabel}`
      : "Manual";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "speaker-row-input";
    input.value = entry.displayName;
    input.dataset.speakerId = speakerId;

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "secondary-button speaker-row-save";
    saveButton.textContent = "Save";
    saveButton.dataset.speakerId = speakerId;

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(createSpeakerGenderSelect(speakerId, entry));
    row.appendChild(saveButton);
    els.speakersOutput.appendChild(row);
  });
}

const LISTEN_LANG_TO_ASSEMBLY_CODE = {
  "hi-IN": "hi",
  "pa-IN": "pa",
  "ta-IN": "ta",
  "es-ES": "es",
  "fr-FR": "fr",
  "pt-BR": "pt",
  "de-DE": "de",
  "zh-CN": "zh",
  "ar-SA": "ar",
};

function listenLanguageToAssemblyCode() {
  const listen = els.listenLanguageSelect?.value || "hi-IN";
  if (LISTEN_LANG_TO_ASSEMBLY_CODE[listen]) return LISTEN_LANG_TO_ASSEMBLY_CODE[listen];
  const base = listen.split("-")[0].toLowerCase();
  return base.length >= 2 ? base : "hi";
}

function listenLanguageSupportsAccuracyMode() {
  const listen = els.listenLanguageSelect?.value || "";
  return listen !== "mixed" && listen !== "en-US";
}

function canUseMultiSpeakerMode() {
  if (!window.RJCloud?.user) return false;
  return Boolean(window.RJCloud.hasAssemblyAiAccess?.() || window.RJCloud.canUseFeature?.("speakerDiarization"));
}

function canUseHindiAccuracyMode() {
  return canUseMultiSpeakerMode() && listenLanguageSupportsAccuracyMode();
}

function shouldUseHindiAccuracy() {
  return state.hindiAccuracyMode
    && canUseHindiAccuracyMode()
    && typeof window.RJHindiRecorder === "function";
}

function shouldUseAssemblyAi() {
  if (shouldUseHindiAccuracy()) return false;
  return state.multiSpeakerMode && canUseMultiSpeakerMode() && typeof window.RJAssemblyAiStream === "function";
}

function loadHindiAccuracyMode() {
  state.hindiAccuracyMode = localStorage.getItem(HINDI_ACCURACY_STORAGE_KEY) === "true";
}

function saveHindiAccuracyMode(enabled) {
  state.hindiAccuracyMode = Boolean(enabled);
  localStorage.setItem(HINDI_ACCURACY_STORAGE_KEY, state.hindiAccuracyMode ? "true" : "false");
  if (state.hindiAccuracyMode && state.multiSpeakerMode) {
    saveMultiSpeakerMode(false);
    if (els.multiSpeakerToggle) els.multiSpeakerToggle.checked = false;
  }
}

function renderHindiAccuracyControls() {
  if (!els.hindiAccuracyToggle) return;
  const allowed = canUseHindiAccuracyMode();
  const langOk = listenLanguageSupportsAccuracyMode();
  els.hindiAccuracyToggle.disabled = !allowed || !langOk;
  els.hindiAccuracyToggle.checked = state.hindiAccuracyMode && allowed && langOk;
  const label = els.hindiAccuracyToggle.closest("label");
  const hint = els.hindiAccuracyHint || document.querySelector(".hindi-accuracy-hint");
  let hintText = "";
  if (!window.RJCloud?.user) {
    hintText = "Sign in and add AssemblyAI access to use pinned-language transcription.";
  } else if (!allowed) {
    hintText = "Requires AssemblyAI (same as multi-speaker). Add a key on Profile or ask admin.";
  } else if (!langOk) {
    hintText = "Choose Hindi (or another non-English listen language), not Mixed or English.";
  } else if (state.hindiAccuracyMode) {
    hintText = "On: ~40s draft segments in Panel A, then a higher-quality full pass on Stop. Uses Universal-2 with pinned Hindi. Single speaker.";
  } else {
    hintText = "Off: use Multi-speaker for live voice labels (Whisper). Turn this on for pinned Hindi accuracy.";
  }
  if (label) label.title = hintText;
  if (hint) hint.textContent = hintText;
  if (state.hindiAccuracyMode && state.multiSpeakerMode && els.multiSpeakerToggle) {
    saveMultiSpeakerMode(false);
    els.multiSpeakerToggle.checked = false;
  }
}

function removeTranscriptItemsBySource(source) {
  state.transcriptItems = state.transcriptItems.filter((item) => item.source !== source);
}

function splitTranscriptIntoLines(text, utterances) {
  if (Array.isArray(utterances) && utterances.length) {
    return utterances
      .map((utterance) => String(utterance.text || "").trim())
      .filter(Boolean);
  }
  return String(text || "")
    .split(/(?<=[.!?।])\s+/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 1);
}

function collectHindiKeyterms() {
  const terms = new Set();
  Object.values(state.speakerRegistry).forEach((entry) => {
    const name = String(entry?.displayName || "").trim();
    if (name && name.length >= 2 && !/^Speaker \d+$/i.test(name)) {
      terms.add(name);
    }
  });
  const manual = String(els.speakerInput?.value || "").trim();
  if (manual && manual.length >= 2) terms.add(manual);
  return [...terms].slice(0, 50);
}

async function appendHindiAccuracyLines(result, { source, provisional = false } = {}) {
  const speaker = currentSpeaker();
  const text = String(result?.text || "").trim();
  if (!text) return;

  if (provisional) {
    await addTranscriptItem(text, speaker, { source, provisional: true });
    return;
  }

  const useUtterances = Array.isArray(result?.utterances) && result.utterances.length > 0;
  const lines = useUtterances ? splitTranscriptIntoLines(text, result.utterances) : [text];
  for (const line of lines) {
    await addTranscriptItem(line, speaker, { source, provisional: false });
  }
}

async function transcribeHindiBlob(blob, { full = false } = {}) {
  const audioBase64 = await window.RJHindiRecorder.blobToBase64(blob);
  const mimeType = blob.type || window.RJHindiRecorder.pickMimeType() || "audio/webm";
  return window.RJCloud.transcribeAudioChunk({
    audioBase64,
    mimeType,
    languageCode: listenLanguageToAssemblyCode(),
    keyterms: collectHindiKeyterms(),
    full,
  });
}

function enqueueHindiChunk(blob) {
  if (!blob || blob.size < 8000) return;
  state.hindiChunkQueue.push(blob);
  void processHindiChunkQueue();
}

async function processHindiChunkQueue() {
  if (state.hindiChunkBusy) return;
  state.hindiChunkBusy = true;
  while (state.hindiChunkQueue.length && state.hindiAccuracySessionActive) {
    const blob = state.hindiChunkQueue.shift();
    setStatus("Transcribing last segment…", true);
    render();
    try {
      const result = await transcribeHindiBlob(blob, { full: false });
      if (result?.text) {
        await appendHindiAccuracyLines(result, { source: "hi-chunk", provisional: true });
        recordSpeechActivity();
      }
    } catch (error) {
      console.warn("Hindi chunk transcription failed:", error);
      setStatus(error.message || "Segment transcription failed", false);
    }
  }
  state.hindiChunkBusy = false;
  if (state.hindiAccuracySessionActive) {
    setStatus("Listening (pinned language)… you can keep speaking", true);
    render();
  }
}

async function runHindiAccuracyFullPass(fullBlob) {
  if (!fullBlob || fullBlob.size < 8000) return false;
  try {
    const result = await transcribeHindiBlob(fullBlob, { full: true });
    if (!result?.text) return false;
    removeTranscriptItemsBySource("hi-chunk");
    removeTranscriptItemsBySource("hi-full");
    await appendHindiAccuracyLines(result, { source: "hi-full", provisional: false });
    return true;
  } catch (error) {
    const message = error.message || String(error);
    if (/too large/i.test(message)) {
      setStatus("Final pass skipped (recording too large). Chunked transcript kept.", false);
      return false;
    }
    console.warn("Hindi full pass failed:", error);
    setStatus(message || "Final transcription failed", false);
    return false;
  }
}

async function finalizeHindiAccuracyStop(recorder, statusMessage, options = {}) {
  setStatus("Finalizing transcript…", true);
  render();
  try {
    const fullBlob = await recorder.stop();
    state.hindiChunkQueue = [];
    while (state.hindiChunkBusy) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await processHindiChunkQueue();
    if (fullBlob && fullBlob.size > 0) {
      await runHindiAccuracyFullPass(fullBlob);
    }
  } catch (error) {
    console.warn("Hindi accuracy stop failed:", error);
    setStatus(error.message || "Could not finalize transcript", false);
    render();
    return;
  }
  setStatus(statusMessage, false);
  render();
  if (options.offerAiNotes !== false && options.wasListening && state.transcriptItems.length) {
    maybeOfferAiNotes();
  }
}

async function startHindiAccuracyListening() {
  if (!window.RJHindiRecorder) {
    setStatus("Hindi recorder module not loaded", false);
    return;
  }
  if (!window.RJCloud?.transcribeAudioChunk) {
    setStatus("Sign in for cloud transcription", false);
    return;
  }

  hideContinuePrompt();
  state.isListening = true;
  state.hindiAccuracySessionActive = true;
  state.hindiChunkQueue = [];
  state.hindiChunkBusy = false;
  state.activeManualSpeakerId = null;
  startInactivityMonitor();
  setStatus("Connecting… you can start speaking", true);
  showMicHelp(false);
  render();

  try {
    state.hindiRecorder = new window.RJHindiRecorder({
      onChunk: (blob) => {
        recordSpeechActivity();
        enqueueHindiChunk(blob);
      },
      onError: (error) => {
        console.warn("Hindi recorder error:", error);
        setStatus(error.message || "Recording failed", false);
      },
      onStatus: (status) => {
        if (status === "recording" && state.hindiAccuracySessionActive) {
          setStatus("Listening (pinned language)… draft segments every ~40s; best quality on Stop", true);
        }
      },
    });
    await state.hindiRecorder.start();
    setStatus("Listening (pinned language)… you can start speaking", true);
    render();
  } catch (error) {
    state.isListening = false;
    state.hindiAccuracySessionActive = false;
    state.hindiRecorder = null;
    stopInactivityMonitor();
    setStatus("Mic start failed", false);
    showMicHelp(true);
    els.liveTranscript.textContent = error.message || "Could not start microphone for pinned-language mode.";
    render();
  }
}

function renderMultiSpeakerControls() {
  if (!els.multiSpeakerToggle) return;
  const allowed = canUseMultiSpeakerMode();
  const profile = window.RJCloud?.profile;
  els.multiSpeakerToggle.disabled = !allowed;
  els.multiSpeakerToggle.checked = state.multiSpeakerMode && allowed;
  const label = els.multiSpeakerToggle.closest("label");
  const hint = document.querySelector("#multiSpeakerHint");
  let hintText = "";
  if (!window.RJCloud?.user) {
    hintText = "Sign in to enable multi-speaker detection.";
  } else if (profile?.status === "pending" && !profileIsAdmin(profile)) {
    hintText = "Your account is pending approval. Ask an admin to approve you, or sign out and back in if you are the platform owner.";
  } else if (!allowed) {
    hintText = "Add an AssemblyAI key on Profile (BYOK) or ask admin to grant Speaker diarization.";
  } else {
    hintText = "On: AssemblyAI voice detection (Speaker A, B, …). For Hindi/Tamil/etc. it auto-detects language; English/Spanish/French/German/Portuguese use high-accuracy mode. Stop listening before turning off.";
  }
  if (label) label.title = hintText;
  if (hint) hint.textContent = hintText;
}

/** Languages natively supported by AssemblyAI Universal-3 Pro / Multilingual streaming. */
const ASSEMBLYAI_U3_LANGS = new Set(["en-US", "es-ES", "fr-FR", "pt-BR", "de-DE", "it-IT"]);

function assemblyAiSpeechModel() {
  const listenLang = els.listenLanguageSelect.value;
  // u3-rt-pro and universal-streaming-multilingual only support EN/ES/DE/FR/PT/IT.
  // Hindi, Punjabi, Tamil, Chinese, Arabic, and Mixed need Whisper streaming (99+ languages).
  if (ASSEMBLYAI_U3_LANGS.has(listenLang)) return "u3-rt-pro";
  return "whisper-rt";
}

function assemblyAiUsesLanguageDetection() {
  const model = assemblyAiSpeechModel();
  return model === "whisper-rt" || model === "universal-streaming-multilingual";
}

async function startAssemblyAiListening() {
  if (!window.RJAssemblyAiStream) {
    setStatus("AssemblyAI module not loaded", false);
    return;
  }

  hideContinuePrompt();
  state.isListening = true;
  state.activeManualSpeakerId = null;
  startInactivityMonitor();
  setStatus("Connecting speaker detection… you can start speaking", true);
  showMicHelp(false);
  render();

  try {
    state.assemblyAiStream = new window.RJAssemblyAiStream({
      getToken: () => window.RJCloud.getAssemblyAiStreamingToken(),
      speechModel: assemblyAiSpeechModel(),
      languageDetection: assemblyAiUsesLanguageDetection(),
      maxSpeakers: 8,
      onTurn: ({ text, speakerLabel }) => {
        recordSpeechActivity();
        void addTranscriptItem(text, "", { assemblyLabel: speakerLabel });
      },
      onInterim: ({ text }) => {
        recordSpeechActivity();
        state.liveOriginal = text.trim();
        updateLivePreview(text.trim());
      },
      onError: (error) => {
        console.warn("AssemblyAI stream error:", error);
        setStatus(error.message || "AssemblyAI streaming failed", false);
      },
      onStatus: (status) => {
        if (status === "reconnecting") setStatus("Reconnecting speaker detection…", true);
      },
    });

    await state.assemblyAiStream.start();
    setStatus("Listening with multi-speaker detection", true);
    showMicHelp(false);
    render();
  } catch (error) {
    state.isListening = false;
    state.assemblyAiStream = null;
    stopInactivityMonitor();
    setStatus("Multi-speaker start failed", false);
    showMicHelp(true);
    els.liveTranscript.textContent = error.message || "Could not start AssemblyAI streaming. Check your API key and try again.";
  }
}

const SPEAKER_NAME_BLOCKLIST = new Set([
  "a", "an", "the", "and", "or", "but", "so", "to", "for", "with", "at", "by", "from", "on", "in", "of",
  "i", "me", "my", "we", "us", "our", "you", "your", "he", "him", "his", "she", "her", "they", "them", "their", "it", "its",
  "starting", "looking", "going", "gonna", "reading", "thinking", "trying", "working", "talking", "saying", "getting",
  "doing", "being", "having", "making", "taking", "coming", "running", "walking", "sitting", "standing", "watching",
  "listening", "writing", "waiting", "planning", "buying", "selling", "meeting", "calling", "asking", "telling",
  "here", "there", "now", "then", "just", "also", "very", "really", "maybe", "probably", "actually", "basically",
  "next", "back", "still", "already", "always", "never", "today", "tomorrow", "yesterday", "everyone", "someone",
  "anyone", "nothing", "something", "everything", "okay", "ok", "yes", "no", "not", "when", "where", "what", "who",
  "how", "why", "which", "that", "this", "these", "those", "one", "two", "three", "first", "second", "new", "old",
  "good", "great", "fine", "sure", "right", "wrong", "ready", "sorry", "thanks", "please", "hello", "hi", "hey",
  "introduction", "self", "self-introduction",
]);

const EXPLICIT_NAME_INTRO_PATTERN = /\b(?:my name is|i am|i['']?m called|call me|mera naam|main hoon|naam hai)\s+([A-Z][\p{L}'-]{1,31})\b/iu;
const WIFE_NAME_PATTERN = /\b(?:my\s+)?wife(?:,?\s*(?:whose\s+name\s+is|named|is|'s name is))?\s+([A-Z][\p{L}'-]{1,31})\b/iu;
const HUSBAND_NAME_PATTERN = /\b(?:my\s+)?husband(?:,?\s*(?:whose\s+name\s+is|named|is|'s name is))?\s+([A-Z][\p{L}'-]{1,31})\b/iu;
const ACTION_FOR_PATTERN = /\b(?:action item|task|follow[\s-]?up|owner|assigned to)\s+(?:for|to)\s+([A-Z][\p{L}'-]{1,31})\b/iu;
const AS_MENTIONED_PATTERN = /\b(?:as)\s+([A-Z][\p{L}'-]{1,31})\s+(?:said|mentioned|noted|asked)\b/iu;

function normalizeCandidateName(name) {
  return String(name || "").trim().replace(/^["']|["']$/g, "");
}

function isLikelyPersonName(name) {
  const candidate = normalizeCandidateName(name);
  if (!candidate || candidate.length < 2 || candidate.length > 32) return false;
  if (!/^[\p{L}][\p{L}'-]*$/u.test(candidate)) return false;
  const lower = candidate.toLowerCase();
  if (SPEAKER_NAME_BLOCKLIST.has(lower)) return false;
  if (/^\d+$/.test(candidate)) return false;
  if (/^(speaker|voice)\s*\d+$/i.test(candidate)) return false;
  if (/introduction/i.test(lower)) return false;
  return true;
}

function extractExplicitNameIntro(text) {
  const match = text.match(EXPLICIT_NAME_INTRO_PATTERN);
  if (!match) return null;
  const name = normalizeCandidateName(match[1]);
  return isLikelyPersonName(name) ? name : null;
}

function inferSpeakerGenderFromText(item) {
  const text = item.originalText || item.text || "";
  if (!text) return;

  const wifeMatch = text.match(WIFE_NAME_PATTERN);
  if (wifeMatch) {
    const name = normalizeCandidateName(wifeMatch[1]);
    if (isLikelyPersonName(name)) setSpeakerGenderByName(name, "female");
    if (item.speakerId) setSpeakerGender(item.speakerId, "male");
  }

  const husbandMatch = text.match(HUSBAND_NAME_PATTERN);
  if (husbandMatch) {
    const name = normalizeCandidateName(husbandMatch[1]);
    if (isLikelyPersonName(name)) setSpeakerGenderByName(name, "male");
    if (item.speakerId) setSpeakerGender(item.speakerId, "female");
  }

  if (/\b(?:my\s+)?wife\b/i.test(text) && item.speakerId) {
    setSpeakerGender(item.speakerId, "male");
  }
  if (/\b(?:my\s+)?husband\b/i.test(text) && item.speakerId) {
    setSpeakerGender(item.speakerId, "female");
  }

  if (/\b(?:she|her)\b/i.test(text) && item.speakerId) {
    const entry = state.speakerRegistry[item.speakerId];
    if (entry && !entry.genderLocked && !entry.gender) {
      setSpeakerGender(item.speakerId, "female");
    }
  }
  if (/\b(?:^|\s)(?:he|him)\b/i.test(text) && item.speakerId) {
    const entry = state.speakerRegistry[item.speakerId];
    if (entry && !entry.genderLocked && !entry.gender) {
      setSpeakerGender(item.speakerId, "male");
    }
  }

  const introName = extractExplicitNameIntro(text);
  if (introName && item.speakerId) {
    if (/\b(?:woman|girl|female|महिला|ladki)\b/i.test(text)) {
      setSpeakerGender(item.speakerId, "female");
      setSpeakerGenderByName(introName, "female");
    } else if (/\b(?:man|boy|male|पुरुष|ladka)\b/i.test(text)) {
      setSpeakerGender(item.speakerId, "male");
      setSpeakerGenderByName(introName, "male");
    }
  }
}

function inferSpeakerNamesFromText(item) {
  const text = item.originalText || item.text || "";
  if (!text || !item.speakerId) return;

  const entry = state.speakerRegistry[item.speakerId];
  if (!entry || entry.userLocked) return;

  const assemblyLabel = entry.assemblyLabel;
  const diarizationSpeaker = assemblyLabel && assemblyLabel !== "manual" && assemblyLabel !== "UNKNOWN";

  const explicitName = extractExplicitNameIntro(text);
  if (explicitName) {
    const previous = entry.displayName;
    renameSpeaker(item.speakerId, explicitName, { userLocked: false });
    entry.inferredFrom = "self-intro";
    showSpeakerRenameHint(`Renamed ${previous} → ${explicitName} (from speech)`);
    return;
  }

  // Only link third-person references when diarization created generic Speaker A/B labels.
  if (!diarizationSpeaker) return;

  const actionMatch = text.match(ACTION_FOR_PATTERN);
  if (actionMatch) {
    const name = normalizeCandidateName(actionMatch[1]);
    if (isLikelyPersonName(name)) linkNameToSpeaker(name);
  }

  const mentionMatch = text.match(AS_MENTIONED_PATTERN);
  if (mentionMatch) {
    const name = normalizeCandidateName(mentionMatch[1]);
    if (isLikelyPersonName(name)) linkNameToSpeaker(name);
  }
}

function linkNameToSpeaker(name) {
  const candidate = normalizeCandidateName(name);
  if (!isLikelyPersonName(candidate)) return;
  const existingId = findSpeakerIdByDisplayName(candidate);
  if (existingId) return;

  const genericSpeaker = Object.entries(state.speakerRegistry).find(([, entry]) => (
    !entry.userLocked && /^Speaker \d+$/.test(entry.displayName)
  ));
  if (genericSpeaker) {
    const [speakerId, entry] = genericSpeaker;
    const previous = entry.displayName;
    renameSpeaker(speakerId, candidate, { userLocked: false });
    entry.inferredFrom = "reference";
    showSpeakerRenameHint(`Renamed ${previous} → ${candidate} (from speech)`);
    return;
  }

  resolveManualSpeaker(candidate);
}

let cloudSpeakerInferenceTimer = null;
function maybeInferSpeakerNamesViaCloud(item) {
  if (!window.RJCloud?.user || !window.RJCloud.inferSpeakerNames) return;
  if (!window.RJCloud.canUseFeature?.("aiMeetingNotes") && !window.RJCloud.canUseFeature?.("autoTranslate")) return;

  const entry = state.speakerRegistry[item.speakerId];
  if (!entry || entry.userLocked) return;

  if (cloudSpeakerInferenceTimer) clearTimeout(cloudSpeakerInferenceTimer);
  cloudSpeakerInferenceTimer = setTimeout(async () => {
    cloudSpeakerInferenceTimer = null;
    try {
      const segments = state.transcriptItems.slice(-8).map((segment) => ({
        speakerId: segment.speakerId,
        speaker: displaySpeaker(segment),
        text: segment.originalText || segment.text,
      }));
      const result = await window.RJCloud.inferSpeakerNames({ segments });
      (result.suggestions || []).forEach((suggestion) => {
        const target = state.speakerRegistry[suggestion.speakerId];
        if (!target || target.userLocked || suggestion.confidence < 0.7) return;
        const suggestedName = normalizeCandidateName(suggestion.suggestedName);
        if (!isLikelyPersonName(suggestedName)) return;
        const previous = target.displayName;
        renameSpeaker(suggestion.speakerId, suggestedName, { userLocked: false });
        target.inferredFrom = "cloud";
        showSpeakerRenameHint(`Renamed ${previous} → ${suggestedName} (AI suggestion)`);
      });
    } catch (error) {
      console.warn("Cloud speaker inference skipped:", error);
    }
  }, 2500);
}

function loadMultiSpeakerMode() {
  state.multiSpeakerMode = localStorage.getItem(MULTI_SPEAKER_STORAGE_KEY) === "true";
}

function saveMultiSpeakerMode(enabled) {
  state.multiSpeakerMode = Boolean(enabled);
  localStorage.setItem(MULTI_SPEAKER_STORAGE_KEY, state.multiSpeakerMode ? "true" : "false");
  if (state.multiSpeakerMode && state.hindiAccuracyMode) {
    saveHindiAccuracyMode(false);
    if (els.hindiAccuracyToggle) els.hindiAccuracyToggle.checked = false;
  }
}

function parseSpeakerLine(text, fallbackSpeaker) {
  const match = text.match(/^\s*([\p{L}][\p{L} .'-]{0,31}):\s+(.+)$/u);
  if (!match) return { speaker: fallbackSpeaker || defaultSpeaker(), text };
  const parsedSpeaker = match[1].trim();
  const parsedText = match[2].trim();
  if (!isLikelyPersonName(parsedSpeaker)) {
    return { speaker: fallbackSpeaker || defaultSpeaker(), text };
  }
  return { speaker: parsedSpeaker, text: parsedText };
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
  const text = state.transcriptItems
    .map((item) => `${displaySpeaker(item)}: ${item.originalText || item.text}`)
    .join("\n");

  els.translationOutput.textContent = "Translating notes...";
  try {
    const translated = await translateText(text, target);
    els.translationOutput.textContent = translated || translationFallbackMessage(target);
    setStatus(translated ? "Translated" : "Translation unavailable", false);
  } catch (error) {
    els.translationOutput.textContent = translationFallbackMessage(target);
    setStatus("Translation unavailable", false);
  }
}

function translationFallbackMessage(target) {
  const language = els.translationTargetSelect.options[els.translationTargetSelect.selectedIndex].text;
  return `Translation to ${language} needs a browser translation engine or a signed-in cloud session. Keep "Translate to English" enabled while listening, or sign in to use cloud translation.`;
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
          speakerId: item.speakerId || null,
          speaker: displaySpeaker(item),
          type: item.type,
          text: item.text,
          originalText: item.originalText || item.text,
          language: item.language || null,
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
    ...state.transcriptItems.map((item) => {
      const line = panelBText(item) || item.originalText || item.text;
      return `[${formatTime(item.timestamp)}] ${displaySpeaker(item)} (${formatType(item.type)}): ${line}`;
    }),
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
      const line = panelBText(item) || item.originalText || item.text;
      lines.push(`- **${displaySpeaker(item)}** (${formatTime(item.timestamp)}): ${line}`);
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
    const items = group.map((item) => {
      const original = displayOriginal(item)
        ? `<div class="note-original">${escapeHtml(item.originalText)}</div>`
        : "";
      return `<li><strong>${escapeHtml(displaySpeaker(item))}</strong> (${escapeHtml(formatTime(item.timestamp))}): ${escapeHtml(item.text)}${original}</li>`;
    }).join("");
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
      `${displaySpeaker(item)}: ${panelBText(item) || item.originalText || item.text}`,
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

function maybeOfferAiNotes() {
  if (!canUseAiMeetingNotes()) return;
  els.aiNotesDialog.classList.remove("is-hidden");
}

function hideAiNotesDialog() {
  els.aiNotesDialog.classList.add("is-hidden");
}

function canUseAiMeetingNotes() {
  const cloud = window.RJCloud;
  return Boolean(cloud?.user && cloud?.canUseFeature?.("aiMeetingNotes"));
}

function buildStructuredSections() {
  const sections = {
    Decisions: [],
    "Action items": [],
    Risks: [],
    "Open questions": [],
    "Running notes": [],
  };
  const map = {
    decisions: "Decisions",
    actions: "Action items",
    risks: "Risks",
    questions: "Open questions",
    notes: "Running notes",
  };
  state.transcriptItems.forEach((item) => {
    const key = map[item.type] || "Running notes";
    sections[key].push(`${displaySpeaker(item)}: ${item.text}`);
  });
  return sections;
}

function meetingMetadata() {
  const speakers = [...new Set(state.transcriptItems.map((i) => displaySpeaker(i)).filter(Boolean))];
  const started = state.meetingStartedAt || state.transcriptItems[0]?.timestamp;
  const ended = state.transcriptItems.at(-1)?.timestamp || new Date();
  const durationMinutes = started
    ? Math.max(1, Math.round((ended - started) / 60000))
    : null;
  return {
    date: new Date().toISOString(),
    durationMinutes,
    speakers,
    preferredLanguage: translatedPanelLanguageCode(),
  };
}

async function generateAiMeetingNotes(mode) {
  if (!canUseAiMeetingNotes()) {
    window.location.href = "signup.html";
    return;
  }
  hideAiNotesDialog();
  setStatus("Generating meeting notes...", false);
  els.generatedNotesOutput.textContent = "Generating...";
  els.generatedNotesSection.classList.remove("is-hidden");

  const payload = {
    mode,
    title: meetingTitle(),
    metadata: meetingMetadata(),
    sections: buildStructuredSections(),
    segments: serializedSegments(),
  };

  try {
    const result = await window.RJCloud.generateMeetingNotes(payload);
    state.generatedNotesMarkdown = result.markdown || "";
    state.generatedNotesMode = result.mode || mode;
    renderGeneratedNotesMarkdown(state.generatedNotesMarkdown);
    setStatus("Meeting notes ready", false);
  } catch (error) {
    els.generatedNotesOutput.textContent = error.message || "Could not generate meeting notes.";
    setStatus("AI notes failed", false);
    return;
  }

  // Cloud save is best-effort and separate: a save failure (e.g. account pending
  // or cloud save not enabled) must never clear the notes already shown above.
  if (window.RJCloud?.user) {
    try {
      const saveResult = await window.RJCloud.saveMeeting({
        title: meetingTitle(),
        segments: serializedSegments(),
        meetingId: state.lastCloudMeetingId || undefined,
        generatedNotes: {
          mode: state.generatedNotesMode,
          markdown: state.generatedNotesMarkdown,
          language: translatedPanelLanguageCode(),
        },
      });
      state.lastCloudMeetingId = saveResult.meetingId;
      setStatus("Notes saved to cloud", false);
    } catch (error) {
      setStatus(`Notes ready (not saved to cloud: ${error.message || "save unavailable"})`, false);
    }
  }
}

function renderInlineMarkdown(text) {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function renderGeneratedNotesMarkdown(markdown) {
  const lines = String(markdown || "").split("\n");
  const parts = [];
  let tableRows = [];

  const flushTable = () => {
    if (!tableRows.length) return;
    parts.push(`<table><tbody>${tableRows.join("")}</tbody></table>`);
    tableRows = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (trimmed.startsWith("|")) {
      if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue;
      const cells = line
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell, index, array) => !(index === 0 && cell === "") && !(index === array.length - 1 && cell === ""));
      if (!cells.length) continue;
      tableRows.push(`<tr>${cells.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`);
      continue;
    }

    flushTable();
    if (!trimmed) continue;
    if (trimmed.startsWith("### ")) {
      parts.push(`<h3>${renderInlineMarkdown(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith("## ")) {
      parts.push(`<h2>${renderInlineMarkdown(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith("# ")) {
      parts.push(`<h1>${renderInlineMarkdown(trimmed.slice(2))}</h1>`);
    } else if (trimmed.startsWith("- ")) {
      parts.push(`<p class="notes-bullet">• ${renderInlineMarkdown(trimmed.slice(2))}</p>`);
    } else {
      parts.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
    }
  }

  flushTable();
  els.generatedNotesOutput.innerHTML = parts.join("");
}

function copyGeneratedNotesForWord() {
  if (!state.generatedNotesMarkdown) return;
  navigator.clipboard.writeText(state.generatedNotesMarkdown).then(() => {
    setStatus("Copied for Word", false);
  });
}

function downloadGeneratedFile(extension, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `meeting-notes-ai.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportGeneratedMarkdown() {
  if (!state.generatedNotesMarkdown) return;
  downloadGeneratedFile("md", "text/markdown", state.generatedNotesMarkdown);
}

function exportGeneratedWord() {
  if (!state.generatedNotesMarkdown) return;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Meeting notes</title></head><body>${els.generatedNotesOutput.innerHTML}</body></html>`;
  downloadGeneratedFile("doc", "application/msword", html);
}

function exportGeneratedPdf() {
  if (!state.generatedNotesMarkdown) return;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(`<!doctype html><html><head><title>Meeting notes</title></head><body>${els.generatedNotesOutput.innerHTML}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

els.listenLanguageSelect.addEventListener("change", () => {
  localStorage.setItem(LISTEN_LANGUAGE_STORAGE_KEY, els.listenLanguageSelect.value);
  state.activeRecognitionLang = isMixedLanguageMode()
    ? MIXED_DEFAULT_RECOGNITION_LANG
    : els.listenLanguageSelect.value;
  if (!listenLanguageSupportsAccuracyMode() && state.hindiAccuracyMode) {
    saveHindiAccuracyMode(false);
  }
  renderHindiAccuracyControls();
  const wasListening = state.isListening;
  resetRecognitionInstance();
  if (wasListening && !shouldUseHindiAccuracy()) {
    ensureRecognitionInstance();
    scheduleRecognitionRestart();
    setStatus(listeningStatusLabel(), true);
  }
});
els.autoTranslateToEnglishToggle.addEventListener("change", render);
els.preferredLanguageSelect?.addEventListener("change", () => {
  saveTranslatedPanelLanguage(els.preferredLanguageSelect.value);
  renderPanelBGenderControls();
  if (state.transcriptItems.length) {
    void translateAllPanelB();
  }
});
els.translatePanelBButton?.addEventListener("click", () => {
  void translateAllPanelB();
});
els.createMeetingNotesButton?.addEventListener("click", () => {
  if (!window.RJCloud?.user) {
    window.location.href = "signup.html";
    return;
  }
  if (!canUseAiMeetingNotes()) {
    setStatus("AI meeting notes are not available on your account", false);
    return;
  }
  if (state.isListening) {
    setStatus("Stop listening before generating meeting notes", false);
    return;
  }
  maybeOfferAiNotes();
});
els.aiNotesDetailManualButton?.addEventListener("click", () => requestAiMeetingNotes("detail"));
els.aiNotesSummaryManualButton?.addEventListener("click", () => requestAiMeetingNotes("summary"));
els.aiNotesDetailButton?.addEventListener("click", () => requestAiMeetingNotes("detail"));
els.aiNotesSummaryButton?.addEventListener("click", () => requestAiMeetingNotes("summary"));
els.aiNotesDismissButton?.addEventListener("click", hideAiNotesDialog);
els.copyNotesForWordButton?.addEventListener("click", copyGeneratedNotesForWord);
els.exportGeneratedMdButton?.addEventListener("click", exportGeneratedMarkdown);
els.exportGeneratedDocButton?.addEventListener("click", exportGeneratedWord);
els.exportGeneratedPdfButton?.addEventListener("click", exportGeneratedPdf);

async function translateAllPanelB() {
  if (!state.transcriptItems.length) {
    setStatus("Nothing to translate yet", false);
    return;
  }

  const signedIn = Boolean(window.RJCloud?.user?.uid);
  const target = translatedPanelLanguageCode();
  state.transcriptItems.forEach((segment) => inferSpeakerGenderFromText(segment));

  const items = state.transcriptItems.filter((item) =>
    segmentNeedsPanelBTranslation(item.originalText || item.text, item));

  if (!items.length) {
    let filled = 0;
    for (const item of state.transcriptItems) {
      if ((!item.text || item.panelBPending) && item.originalText) {
        item.text = item.originalText;
        item.panelBPending = false;
        item.translationFailed = false;
        filled += 1;
      }
    }
    if (filled) render();
    setStatus(`Panel B is already in ${translatedPanelLanguageLabel()}`, false);
    return;
  }

  if (els.translatePanelBButton) els.translatePanelBButton.disabled = true;
  setStatus(
    signedIn
      ? `Translating ${items.length} lines to ${translatedPanelLanguageLabel()}…`
      : `Translating ${items.length} lines (browser — sign in for cloud)…`,
    true,
  );

  let failed = 0;
  for (const item of items) {
    const source = item.originalText || item.text;
    item.translating = true;
    item.translationFailed = false;
    item.panelBPending = false;
    item.translationRetries = 0;
    render();
    try {
      const translated = await withTranslationTimeout(
        translateText(source, target, { forceCloud: true, item }),
        TRANSLATION_CALL_TIMEOUT_MS,
      );
      if (translated && (translated !== source || isLikelyEnglish(source))) {
        item.text = translated;
        item.type = classifyText(item.text);
        item.panelBPending = false;
      } else {
        failed += 1;
        item.translationFailed = true;
        item.panelBPending = true;
        item.text = "";
      }
    } catch (error) {
      console.warn("Panel B translation failed:", error);
      failed += 1;
      item.translationFailed = true;
      item.panelBPending = true;
      item.text = "";
    }
    item.translating = false;
    render();
  }

  if (els.translatePanelBButton) els.translatePanelBButton.disabled = false;
  setStatus(
    failed
      ? `Panel B: ${items.length - failed} translated, ${failed} failed (check cloud / emulators)`
      : `Panel B translated to ${translatedPanelLanguageLabel()}`,
    false,
  );
}

async function retranslateAllSegments() {
  if (!shouldAutoTranslate()) return;
  await translateAllPanelB();
}
els.saveListenSettingsButton.addEventListener("click", saveListeningSettings);
els.continueListeningButton.addEventListener("click", continueListeningAfterPrompt);
els.stopListeningNowButton.addEventListener("click", () => stopListening("Stopped"));
els.startButton.addEventListener("click", requestStartListening);
els.retryMicButton.addEventListener("click", requestStartListening);
els.newMeetingButton?.addEventListener("click", beginNewMeeting);
els.continueMeetingButton?.addEventListener("click", () => {
  hideStartMeetingDialog();
  startListening();
});
els.startNewMeetingButton?.addEventListener("click", () => {
  hideStartMeetingDialog();
  beginNewMeeting();
  startListening();
});
els.startMeetingCancelButton?.addEventListener("click", hideStartMeetingDialog);
els.stopButton.addEventListener("click", stopListening);
els.searchInput.addEventListener("input", renderNotes);
els.autoFormatToggle.addEventListener("change", renderNotes);
els.addManualButton.addEventListener("click", () => {
  const text = els.manualTranscriptInput.value.trim();
  if (!text) return;
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  void (async () => {
    for (const line of lines) {
      await addTranscriptItem(line, currentSpeaker());
    }
    els.manualTranscriptInput.value = "";
    setStatus("Fallback captured", false);
    render();
  })();
});
els.signOutButton.addEventListener("click", async () => {
  try {
    sessionStorage.removeItem(ACTIVE_ROLE_STORAGE_KEY);
    state.activeRole = null;
    await window.RJCloud.signOut();
  } catch (error) {
    els.cloudStatus.textContent = error.message || "Sign-out failed.";
  }
});
els.saveProfileButton.addEventListener("click", async () => {
  try {
    let photoURL = window.RJCloud.profile?.photoURL || "";
    if (els.avatarInput.files?.[0]) {
      photoURL = await window.RJCloud.uploadAvatar(els.avatarInput.files[0]);
    }
    await window.RJCloud.updateProfile({
      displayName: els.profileNameInput.value.trim(),
      photoURL,
      preferredLanguage: els.profilePreferredLanguageSelect.value,
    });
    saveTranslatedPanelLanguage(els.profilePreferredLanguageSelect.value);
    setStatus("Profile saved", false);
  } catch (error) {
    setStatus("Profile save failed", false);
  }
});
els.changePasswordButton.addEventListener("click", async () => {
  try {
    await window.RJCloud.changePassword(els.newPasswordInput.value);
    els.newPasswordInput.value = "";
    setStatus("Password changed", false);
  } catch (error) {
    setStatus("Password change failed", false);
    setStatus("Password change failed", false);
  }
});
els.saveApiKeyButton.addEventListener("click", async () => {
  try {
    await window.RJCloud.saveUserApiKey({
      provider: els.apiProviderSelect.value,
      label: els.apiKeyLabelInput.value.trim(),
      endpoint: els.apiEndpointInput.value.trim(),
      apiKey: els.apiKeyInput.value,
    });
    els.apiKeyInput.value = "";
    await refreshApiKeys();
    setStatus("API key saved", false);
  } catch (error) {
    els.apiKeysOutput.textContent = error.message || "API key save failed.";
  }
});
els.apiKeysOutput.addEventListener("click", async (event) => {
  const keyId = event.target.dataset.deleteKey;
  if (!keyId) return;
  await window.RJCloud.deleteUserApiKey(keyId);
  await refreshApiKeys();
});
els.refreshUsersButton.addEventListener("click", refreshAdminUsers);
els.adminUserSearch?.addEventListener("input", applyAdminUserFilter);
els.adminUsersOutput.addEventListener("click", async (event) => {
  const container = event.target.closest("[data-admin-user]");
  if (!container) return;
  // Only act on real action buttons. Clicking the plan select, number inputs,
  // unit dropdowns, labels, etc. must NOT trigger a refresh (which would rebuild
  // the list, close the dropdown, and jump the scroll position).
  const actionEl = event.target.closest("[data-admin-action], [data-admin-temp]");
  if (!actionEl) return;
  const uid = container.dataset.adminUser;
  try {
    if (event.target.dataset.adminTemp) {
      await window.RJCloud.adminGenerateTemporaryPassword(uid);
    } else if (event.target.dataset.adminAction === "setPlan") {
      const planSelect = container.querySelector("[data-admin-plan]");
      await window.RJCloud.adminUpdateUser({ uid, action: "setPlan", plan: planSelect.value });
    } else if (event.target.dataset.adminAction === "updateDetails") {
      await window.RJCloud.adminUpdateUser({
        uid,
        action: "updateDetails",
        firstName: container.querySelector("[data-edit-firstname]").value,
        lastName: container.querySelector("[data-edit-lastname]").value,
        contactEmail: container.querySelector("[data-edit-email]").value,
      });
    } else if (event.target.dataset.adminAction === "deleteUser") {
      const label = event.target.dataset.userLabel || "this user";
      const confirmed = window.confirm(`Permanently delete ${label}? This removes their login, profile, and all saved meetings. This cannot be undone.`);
      if (!confirmed) return;
      await window.RJCloud.adminDeleteUser(uid);
    } else if (["extendFeature", "pauseFeature", "resumeFeature"].includes(event.target.dataset.adminAction)) {
      const row = event.target.closest("[data-feature-key]");
      await window.RJCloud.adminUpdateUser({
        uid,
        action: event.target.dataset.adminAction,
        featureKey: row.dataset.featureKey,
        amount: Number(row.querySelector("[data-feature-amount]").value || 7),
        unit: row.querySelector("[data-feature-unit]").value,
      });
    } else if (event.target.dataset.adminAction) {
      await window.RJCloud.adminUpdateUser({
        uid,
        action: event.target.dataset.adminAction,
        guestAmount: 10,
        guestUnit: "days",
      });
    }
    await refreshAdminUsers();
  } catch (error) {
    els.adminUsersOutput.textContent = error.message || "Admin action failed.";
  }
});
els.pageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const pageId = button.dataset.page;
    if (!pageAllowedForActiveRole(pageId)) {
      setStatus("Switch to Admin dashboard to open Admin", false);
      return;
    }
    location.hash = pageId;
    renderPage(pageId);
    if (pageId === "adminPage") refreshAdminUsers();
    if (pageId === "profilePage") refreshApiKeys();
  });
});
if (els.roleSwitcherSelect) {
  els.roleSwitcherSelect.addEventListener("change", () => {
    setActiveRole(els.roleSwitcherSelect.value);
  });
}
document.querySelectorAll(".password-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.querySelector(`#${button.dataset.passwordTarget}`);
    input.type = input.type === "password" ? "text" : "password";
  });
});
window.addEventListener("hashchange", () => renderPage());
els.saveCloudButton.addEventListener("click", saveCurrentMeetingToCloud);
els.refreshMeetingsButton.addEventListener("click", () => refreshSavedMeetings());
els.savedMeetingSelect?.addEventListener("change", () => {
  const meetingId = els.savedMeetingSelect.value;
  if (!meetingId) return;
  void loadSavedMeeting(meetingId);
});
window.addEventListener("rj-cloud-ready", renderCloudControls);
window.addEventListener("rj-cloud-auth", async () => {
  applyActiveRoleView();
  renderCloudControls();
  renderUserChrome();
  renderMultiSpeakerControls();
  renderHindiAccuracyControls();
  if (window.RJCloud?.user) {
    const profile = window.RJCloud.profile;
    if (profileIsAdmin(profile) || profile?.status === "active") {
      await refreshSavedMeetings();
      await refreshApiKeys();
    }
  }
});
window.addEventListener("rj-cloud-error", (event) => {
  els.cloudStatus.textContent = event.detail?.message || "Cloud sign-in failed.";
});
els.translateButton.addEventListener("click", translateNotes);
els.exportButtons.forEach((button) => {
  button.addEventListener("click", () => exportTranscript(button.dataset.exportFormat));
});
els.clearButton.addEventListener("click", beginNewMeeting);
els.sampleButton.addEventListener("click", () => {
  sampleLines.forEach((line) => addTranscriptItem(line.text, line.speaker));
  setStatus("Sample loaded", false);
  render();
});
els.questionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = els.questionInput.value.trim();
  if (!question) return;
  const useCloud = els.useCloudQuestionToggle.checked && window.RJCloud?.user;
  if (useCloud && !els.savedMeetingSelect.value) {
    els.answerOutput.innerHTML = `${answerQuestion(question)}<p class="helper-text">Tip: Save to cloud first, select that meeting, then enable “Ask saved cloud notes” for vector search.</p>`;
    return;
  }
  if (useCloud) {
    els.answerOutput.textContent = "Searching saved cloud notes...";
    window.RJCloud.askMeeting({
      question,
      meetingId: els.savedMeetingSelect.value,
    }).then((result) => {
      const sources = result.sources?.length
        ? `<p><strong>Sources:</strong> ${result.sources.map((source) => escapeHtml(source.speaker || "Speaker 1")).join(", ")}</p>`
        : "";
      els.answerOutput.innerHTML = `<p>${escapeHtml(result.answer || "No answer returned.")}</p>${sources}`;
    }).catch((error) => {
      els.answerOutput.textContent = error.message || "Cloud Q&A failed.";
    });
    return;
  }
  els.answerOutput.innerHTML = answerQuestion(question);
});

render();
renderPage();
loadListeningSettings();
loadListenLanguage();
loadPreferredLanguage();
loadMultiSpeakerMode();
loadHindiAccuracyMode();

els.speakerInput?.addEventListener("change", () => {
  state.activeManualSpeakerId = null;
});
els.speakerInput?.addEventListener("input", () => {
  const value = els.speakerInput.value.trim();
  if (!value || /^Speaker \d+$/i.test(value)) return;
  state.activeManualSpeakerId = resolveManualSpeaker(value);
});

if (els.multiSpeakerToggle) {
  els.multiSpeakerToggle.addEventListener("change", () => {
    if (state.isListening) {
      setStatus("Stop listening before changing multi-speaker mode", false);
      els.multiSpeakerToggle.checked = state.multiSpeakerMode;
      return;
    }
    saveMultiSpeakerMode(els.multiSpeakerToggle.checked);
    renderMultiSpeakerControls();
    renderHindiAccuracyControls();
  });
}

if (els.hindiAccuracyToggle) {
  els.hindiAccuracyToggle.addEventListener("change", () => {
    if (state.isListening) {
      setStatus("Stop listening before changing accuracy mode", false);
      els.hindiAccuracyToggle.checked = state.hindiAccuracyMode;
      return;
    }
    saveHindiAccuracyMode(els.hindiAccuracyToggle.checked);
    renderHindiAccuracyControls();
    renderMultiSpeakerControls();
  });
}

if (els.speakersOutput) {
  els.speakersOutput.addEventListener("click", (event) => {
    const speakerId = event.target.dataset.speakerId;
    if (!speakerId || !event.target.classList.contains("speaker-row-save")) return;
    if (!applySpeakerGenderFromControls(speakerId)) return;
    const entry = state.speakerRegistry[speakerId];
    showSpeakerRenameHint(`Saved ${entry?.displayName || "speaker"}`);
    renderSpeakersPanel();
    renderPanelBGenderControls();
  });
}
