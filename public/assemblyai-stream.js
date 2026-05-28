(function initAssemblyAiStream(global) {
  const SAMPLE_RATE = 16000;

  function floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return buffer;
  }

  function downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
    if (inputSampleRate === outputSampleRate) return buffer;
    const ratio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
        accum += buffer[i];
        count += 1;
      }
      result[offsetResult] = count ? accum / count : 0;
      offsetResult += 1;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  class AssemblyAiStream {
    constructor(options = {}) {
      this.getToken = options.getToken;
      this.onTurn = options.onTurn || (() => {});
      this.onInterim = options.onInterim || (() => {});
      this.onError = options.onError || (() => {});
      this.onStatus = options.onStatus || (() => {});
      this.speechModel = options.speechModel || "universal-streaming-english";
      this.maxSpeakers = options.maxSpeakers || 8;
      this.languageDetection = Boolean(options.languageDetection);
      this.formatTurns = options.formatTurns !== false;
      this.ws = null;
      this.audioContext = null;
      this.mediaStream = null;
      this.sourceNode = null;
      this.processor = null;
      this.running = false;
      this.shouldReconnect = false;
      this.reconnectTimer = null;
      this.lastInterim = "";
      this.pendingAudio = [];
    }

    async start() {
      if (this.running) return;
      this.running = true;
      this.shouldReconnect = true;
      this.pendingAudio = [];
      // Start mic and connection in parallel so speech during connection is
      // buffered (not dropped) and flushed once the socket opens.
      const micPromise = this.startMic().catch((error) => {
        this.onError(error);
        throw error;
      });
      const connectPromise = this.connect();
      await Promise.all([connectPromise, micPromise]);
    }

    bufferAudio(pcm) {
      if (!this.pendingAudio) this.pendingAudio = [];
      this.pendingAudio.push(pcm);
      // Cap to roughly the last ~20s of audio to bound memory.
      const MAX_BUFFERED_FRAMES = 240;
      if (this.pendingAudio.length > MAX_BUFFERED_FRAMES) {
        this.pendingAudio.shift();
      }
    }

    flushPendingAudio() {
      if (!this.pendingAudio || !this.pendingAudio.length) return;
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const frames = this.pendingAudio;
      this.pendingAudio = [];
      for (const pcm of frames) {
        try {
          this.ws.send(pcm);
        } catch (error) {
          console.warn("AssemblyAI buffered audio send failed:", error);
          break;
        }
      }
    }

    async stop() {
      this.shouldReconnect = false;
      this.running = false;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.stopMic();
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: "Terminate" }));
        } catch (error) {
          console.warn("AssemblyAI terminate failed:", error);
        }
      }
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    }

    async connect() {
      if (!this.getToken) throw new Error("AssemblyAI token provider is missing.");
      const tokenData = await this.getToken();
      if (!tokenData?.token) throw new Error("Could not obtain AssemblyAI streaming token.");

      const params = new URLSearchParams({
        sample_rate: String(SAMPLE_RATE),
        speaker_labels: "true",
        max_speakers: String(this.maxSpeakers),
        format_turns: String(this.formatTurns),
        token: tokenData.token,
      });
      if (this.speechModel) params.set("speech_model", this.speechModel);
      if (this.languageDetection) params.set("language_detection", "true");

      const endpoint = `wss://streaming.assemblyai.com/v3/ws?${params.toString()}`;
      this.ws = new WebSocket(endpoint);

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("AssemblyAI connection timed out.")), 15000);
        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.onStatus("connected");
          this.flushPendingAudio();
          resolve();
        };
        this.ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("AssemblyAI WebSocket connection failed."));
        };
      });

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.warn("AssemblyAI message parse failed:", error);
        }
      };

      this.ws.onerror = () => {
        this.onError(new Error("AssemblyAI streaming error."));
      };

      this.ws.onclose = () => {
        this.ws = null;
        if (this.shouldReconnect && this.running) {
          this.onStatus("reconnecting");
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.shouldReconnect && this.running) {
              this.connect().catch((error) => this.onError(error));
            }
          }, 500);
        }
      };
    }

    extractSpeakerSegments(message) {
      const turnSpeaker = message.speaker_label || "UNKNOWN";
      const transcript = String(message.transcript || message.text || "").trim();
      const words = Array.isArray(message.words) ? message.words : [];
      const finalWords = words.filter((word) => word.word_is_final);

      if (!finalWords.length) {
        if (!transcript) return [];
        return [{ speakerLabel: turnSpeaker, text: transcript }];
      }

      const segments = [];
      let currentSpeaker = null;
      let currentWords = [];

      const flush = () => {
        const text = currentWords.join(" ").replace(/\s+/g, " ").trim();
        if (text) segments.push({ speakerLabel: currentSpeaker || turnSpeaker, text });
        currentWords = [];
      };

      for (const word of finalWords) {
        const speaker = word.speaker || turnSpeaker;
        if (speaker !== currentSpeaker) {
          flush();
          currentSpeaker = speaker;
        }
        currentWords.push(String(word.text || "").trim());
      }
      flush();
      return segments.filter((segment) => segment.text);
    }

    handleMessage(message) {
      const type = message.type || message.message_type;
      if (type === "Turn") {
        const transcript = String(message.transcript || message.text || "").trim();
        const speakerLabel = message.speaker_label || "UNKNOWN";
        const isFinal = Boolean(message.end_of_turn);
        if (!transcript && !isFinal) return;
        if (isFinal) {
          this.lastInterim = "";
          const segments = this.extractSpeakerSegments(message);
          if (!segments.length && transcript) {
            this.onTurn({ text: transcript, speakerLabel, isFinal: true });
            return;
          }
          segments.forEach((segment) => {
            this.onTurn({
              text: segment.text,
              speakerLabel: segment.speakerLabel,
              isFinal: true,
            });
          });
        } else {
          this.lastInterim = transcript;
          this.onInterim({ text: transcript, speakerLabel });
        }
        return;
      }

      if (type === "PartialTranscript" || type === "partial") {
        const text = String(message.text || message.transcript || "").trim();
        if (text) {
          this.lastInterim = text;
          this.onInterim({ text, speakerLabel: message.speaker_label || "UNKNOWN" });
        }
        return;
      }

      if (type === "FinalTranscript" || type === "final") {
        const segments = this.extractSpeakerSegments({
          transcript: message.text || message.transcript,
          speaker_label: message.speaker_label,
          words: message.words,
        });
        segments.forEach((segment) => {
          this.onTurn({
            text: segment.text,
            speakerLabel: segment.speakerLabel,
            isFinal: true,
          });
        });
      }
    }

    async startMic() {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      this.audioContext = new AudioContext();
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const downsampled = downsampleBuffer(input, this.audioContext.sampleRate, SAMPLE_RATE);
        const pcm = floatTo16BitPCM(downsampled);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(pcm);
        } else {
          // Socket not open yet (initial connect or reconnect) — buffer so we
          // don't lose the opening words.
          this.bufferAudio(pcm);
        }
      };

      this.sourceNode.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    }

    stopMic() {
      this.pendingAudio = [];
      if (this.processor) {
        this.processor.disconnect();
        this.processor.onaudioprocess = null;
        this.processor = null;
      }
      if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop());
        this.mediaStream = null;
      }
      if (this.audioContext) {
        this.audioContext.close().catch(() => {});
        this.audioContext = null;
      }
    }
  }

  global.RJAssemblyAiStream = AssemblyAiStream;
})(window);
