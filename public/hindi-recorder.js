(function initHindiRecorder(global) {
  const CHUNK_INTERVAL_MS = 40000;
  const MIN_CHUNK_BYTES = 8000;

  function pickMimeType() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    for (const type of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return "";
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = String(reader.result || "");
        const comma = dataUrl.indexOf(",");
        resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
      };
      reader.onerror = () => reject(reader.error || new Error("Could not read audio blob."));
      reader.readAsDataURL(blob);
    });
  }

  class HindiRecorder {
    constructor(options = {}) {
      this.onChunk = options.onChunk || (() => {});
      this.onError = options.onError || (() => {});
      this.onStatus = options.onStatus || (() => {});
      this.acquireStream = options.acquireStream || null;
      this.chunkIntervalMs = Number(options.chunkIntervalMs) || CHUNK_INTERVAL_MS;
      this.mimeType = pickMimeType();
      this.running = false;
      this.mediaStream = null;
      this.releaseStream = null;
      this.fullRecorder = null;
      this.intervalRecorder = null;
      this.intervalTimer = null;
      this.fullChunks = [];
      this.intervalChunks = [];
      this.stopPromise = null;
      this.stopResolve = null;
    }

    async start() {
      if (this.running) return;
      this.running = true;
      this.fullChunks = [];
      this.onStatus("mic");

      if (this.acquireStream) {
        const acquired = await this.acquireStream();
        this.mediaStream = acquired.stream;
        this.releaseStream = acquired.release || null;
      } else {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: true,
            sampleRate: { ideal: 48000 },
          },
        });
        this.releaseStream = null;
      }

      let recorderOptions;
      try {
        recorderOptions = this.mimeType
          ? { mimeType: this.mimeType, audioBitsPerSecond: 128000 }
          : { audioBitsPerSecond: 128000 };
        this.fullRecorder = new MediaRecorder(this.mediaStream, recorderOptions);
      } catch {
        recorderOptions = this.mimeType ? { mimeType: this.mimeType } : undefined;
        this.fullRecorder = new MediaRecorder(this.mediaStream, recorderOptions);
      }
      this.fullRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) this.fullChunks.push(event.data);
      };
      // One continuous WebM for the final high-accuracy pass (no 1s fragment stitching).
      this.fullRecorder.start();

      this.startIntervalRecorder();
      this.onStatus("recording");
    }

    startIntervalRecorder() {
      if (!this.running || !this.mediaStream) return;

      this.intervalChunks = [];
      let intervalOptions;
      try {
        intervalOptions = this.mimeType
          ? { mimeType: this.mimeType, audioBitsPerSecond: 128000 }
          : { audioBitsPerSecond: 128000 };
        this.intervalRecorder = new MediaRecorder(this.mediaStream, intervalOptions);
      } catch {
        intervalOptions = this.mimeType ? { mimeType: this.mimeType } : undefined;
        this.intervalRecorder = new MediaRecorder(this.mediaStream, intervalOptions);
      }

      this.intervalRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) this.intervalChunks.push(event.data);
      };

      this.intervalRecorder.onstop = () => {
        if (!this.running) return;
        const blob = new Blob(this.intervalChunks, {
          type: this.mimeType || this.intervalRecorder.mimeType || "audio/webm",
        });
        this.intervalChunks = [];
        if (blob.size >= MIN_CHUNK_BYTES) {
          void Promise.resolve(this.onChunk(blob)).catch((error) => {
            this.onError(error instanceof Error ? error : new Error(String(error)));
          });
        }
        if (this.running) this.startIntervalRecorder();
      };

      this.intervalRecorder.onerror = (event) => {
        this.onError(event.error || new Error("Interval recorder failed."));
      };

      this.intervalRecorder.start();
      this.intervalTimer = setTimeout(() => {
        this.intervalTimer = null;
        if (this.intervalRecorder && this.intervalRecorder.state === "recording") {
          this.intervalRecorder.stop();
        }
      }, this.chunkIntervalMs);
    }

    stopIntervalRecorder() {
      if (this.intervalTimer) {
        clearTimeout(this.intervalTimer);
        this.intervalTimer = null;
      }
      if (this.intervalRecorder && this.intervalRecorder.state === "recording") {
        try {
          this.intervalRecorder.stop();
        } catch (error) {
          console.warn("Interval recorder stop failed:", error);
        }
      }
      this.intervalRecorder = null;
    }

    async stop() {
      if (!this.running && !this.stopPromise) {
        return new Blob([], { type: this.mimeType || "audio/webm" });
      }

      if (this.stopPromise) return this.stopPromise;

      this.stopPromise = new Promise((resolve) => {
        this.stopResolve = resolve;
      });

      this.running = false;
      this.stopIntervalRecorder();

      const finalize = () => {
        const fullBlob = new Blob(this.fullChunks, {
          type: this.mimeType || this.fullRecorder?.mimeType || "audio/webm",
        });
        this.fullChunks = [];
        if (this.releaseStream) {
          try {
            this.releaseStream();
          } catch (error) {
            console.warn("Capture release failed:", error);
          }
          this.releaseStream = null;
          this.mediaStream = null;
        } else if (this.mediaStream) {
          this.mediaStream.getTracks().forEach((track) => track.stop());
          this.mediaStream = null;
        }
        this.onStatus("stopped");
        if (this.stopResolve) this.stopResolve(fullBlob);
        return fullBlob;
      };

      if (this.fullRecorder && this.fullRecorder.state !== "inactive") {
        this.fullRecorder.onstop = () => finalize();
        try {
          this.fullRecorder.stop();
        } catch (error) {
          console.warn("Full recorder stop failed:", error);
          finalize();
        }
      } else {
        finalize();
      }

      return this.stopPromise;
    }
  }

  HindiRecorder.blobToBase64 = blobToBase64;
  HindiRecorder.pickMimeType = pickMimeType;
  global.RJHindiRecorder = HindiRecorder;
})(window);
