(function initRjCapture(global) {
  // #region agent log
  function dbgCapture(hypothesisId, location, message, data) {
    fetch("http://127.0.0.1:7527/ingest/01a39fbc-e5ce-4de1-b62c-666baeafed00", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "81d54c" },
      body: JSON.stringify({
        sessionId: "81d54c",
        hypothesisId,
        location,
        message,
        data,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion

  /**
   * RJCapture — pluggable audio capture for the meeting secretary app.
   *
   * Source interface (all return { stream, kind, release }):
   *   mic      — close-talk microphone (echo/noise suppression on)
   *   micRoom  — passive room listening (filters off, auto-gain on)
   *   system   — meeting audio on this device via getDisplayMedia
   *   both     — mic + system mixed
   *   native   — FUTURE: desktop loopback (Electron / virtual cable); not implemented yet
   */
  const SOURCES = ["mic", "micRoom", "system", "both"];

  function normalizeSource(source) {
    const value = String(source || "mic").trim();
    return SOURCES.includes(value) ? value : "mic";
  }

  function systemAudioSupported() {
    return Boolean(
      typeof navigator !== "undefined"
      && navigator.mediaDevices
      && typeof navigator.mediaDevices.getDisplayMedia === "function",
    );
  }

  function micConstraints(source) {
    if (source === "micRoom") {
      return {
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      };
    }
    return {
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    };
  }

  function stopStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (_) {
        /* ignore */
      }
    });
  }

  async function acquireMic(source) {
    const stream = await navigator.mediaDevices.getUserMedia(micConstraints(source));
    const tracks = stream.getAudioTracks();
    // #region agent log
    dbgCapture("L", "capture.js:acquireMic", "mic device", {
      source,
      labels: tracks.map((t) => t.label),
      echoCancellation: source !== "micRoom",
    });
    // #endregion
    return stream;
  }

  const SILENT_SYSTEM_PEAK = 0.0008;

  function shareKindFromSurfaces(displaySurfaces) {
    if (displaySurfaces.includes("browser")) return "browser-tab";
    if (displaySurfaces.includes("window")) return "app-window";
    if (displaySurfaces.includes("monitor")) return "monitor";
    return "other";
  }

  function readAnalyserPeak(analyser) {
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i += 1) {
      peak = Math.max(peak, Math.abs(data[i]));
    }
    return peak;
  }

  async function probeStreamPeak(stream, durationMs = 2200) {
    const ctx = new AudioContext();
    try {
      if (ctx.state === "suspended") await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      let maxPeak = 0;
      const end = performance.now() + durationMs;
      while (performance.now() < end) {
        maxPeak = Math.max(maxPeak, readAnalyserPeak(analyser));
        await new Promise((resolve) => {
          requestAnimationFrame(resolve);
        });
      }
      src.disconnect();
      return maxPeak;
    } finally {
      await ctx.close().catch(() => {});
    }
  }

  const NOTE_SHARE_AUDIO_OFF =
    "Chrome's \"Share system audio\" was off — websites cannot turn that on for you (browser security). "
    + "Listening through your Jabra microphone instead. Next time choose Room listening to skip screen share.";

  const NOTE_SILENT_LOOPBACK =
    "Screen audio did not come through (common with the Teams desktop app on Windows). "
    + "Listening through your Jabra microphone instead — play the meeting on the Jabra speakers and turn volume up. "
    + "Tip: use Room listening next time (no share dialog).";

  async function acquireSystem() {
    if (!systemAudioSupported()) {
      throw new Error("Meeting audio capture is not supported in this browser. Try Chrome or Edge.");
    }

    const videoTracksBeforeStop = [];
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: { ideal: "monitor" } },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        systemAudio: "include",
      },
    });

    displayStream.getVideoTracks().forEach((track) => {
      const settings = track.getSettings?.() || {};
      videoTracksBeforeStop.push({
        label: track.label,
        displaySurface: settings.displaySurface || "",
      });
      track.stop();
      displayStream.removeTrack(track);
    });

    const audioTracks = displayStream.getAudioTracks();
    // #region agent log
    const displaySurfaces = videoTracksBeforeStop.map((t) => t.displaySurface);
    const shareKind = shareKindFromSurfaces(displaySurfaces);
    dbgCapture("A", "capture.js:acquireSystem", "displayMedia result", {
      videoTrackCount: videoTracksBeforeStop.length,
      audioTrackCount: audioTracks.length,
      audioLabels: audioTracks.map((t) => t.label).slice(0, 3),
      displaySurfaces,
      shareKind,
    });
    // #endregion
    if (!audioTracks.length) {
      stopStream(displayStream);
      return { stream: null, shareKind, probePeak: 0, missingAudioTrack: true };
    }

    const audioOnly = new MediaStream(audioTracks);
    stopStream(displayStream);

    const probePeak = await probeStreamPeak(audioOnly);
    // #region agent log
    dbgCapture("M", "capture.js:probeSystem", "system peak probe", {
      probePeak: Number(probePeak.toFixed(5)),
      shareKind,
      missingAudioTrack: false,
    });
    // #endregion

    return { stream: audioOnly, shareKind, probePeak, missingAudioTrack: false };
  }

  function systemNeedsMicFallback(systemResult) {
    if (!systemResult) return true;
    if (systemResult.missingAudioTrack) return true;
    return systemResult.probePeak < SILENT_SYSTEM_PEAK;
  }

  function systemFallbackNote(systemResult) {
    if (systemResult?.missingAudioTrack) return NOTE_SHARE_AUDIO_OFF;
    return NOTE_SILENT_LOOPBACK;
  }

  function mixStreams(micStream, systemStream, { systemGain = 8, micGain = 1 } = {}) {
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    const nodes = [];
    let micAnalyser = null;
    let systemAnalyser = null;
    let levelTimer = null;

    if (micStream) {
      const micNode = audioContext.createMediaStreamSource(micStream);
      const micGainNode = audioContext.createGain();
      micGainNode.gain.value = micGain;
      micAnalyser = audioContext.createAnalyser();
      micAnalyser.fftSize = 2048;
      micNode.connect(micAnalyser);
      micAnalyser.connect(micGainNode);
      micGainNode.connect(destination);
      nodes.push(micNode, micAnalyser, micGainNode);
    }
    if (systemStream) {
      const systemNode = audioContext.createMediaStreamSource(systemStream);
      const systemGainNode = audioContext.createGain();
      systemGainNode.gain.value = systemGain;
      systemAnalyser = audioContext.createAnalyser();
      systemAnalyser.fftSize = 2048;
      systemNode.connect(systemAnalyser);
      systemAnalyser.connect(systemGainNode);
      systemGainNode.connect(destination);
      nodes.push(systemNode, systemAnalyser, systemGainNode);
    }

    if (micAnalyser || systemAnalyser) {
      levelTimer = setInterval(() => {
        const micPeak = micAnalyser ? Number(readAnalyserPeak(micAnalyser).toFixed(4)) : null;
        const systemPeak = systemAnalyser ? Number(readAnalyserPeak(systemAnalyser).toFixed(4)) : null;
        // #region agent log
        dbgCapture("K", "capture.js:mixLevels", "channel peaks", {
          micPeak,
          systemPeak,
          systemGain,
          micGain,
        });
        // #endregion
      }, 5000);
    }

    return {
      stream: destination.stream,
      releaseExtra() {
        if (levelTimer) {
          clearInterval(levelTimer);
          levelTimer = null;
        }
        nodes.forEach((node) => {
          try {
            node.disconnect();
          } catch (_) {
            /* ignore */
          }
        });
        audioContext.close().catch(() => {});
      },
    };
  }

  async function acquire({ source } = {}) {
    const kind = normalizeSource(source);
    // #region agent log
    dbgCapture("A", "capture.js:acquire", "acquire start", { source, kind });
    // #endregion
    const ownedStreams = [];
    let releaseExtra = () => {};

    const release = () => {
      releaseExtra();
      ownedStreams.forEach(stopStream);
      ownedStreams.length = 0;
    };

    try {
      if (kind === "mic" || kind === "micRoom") {
        const stream = await acquireMic(kind);
        ownedStreams.push(stream);
        return { stream, kind, release, captureNote: "" };
      }

      if (kind === "system") {
        const systemResult = await acquireSystem();
        if (systemNeedsMicFallback(systemResult)) {
          if (systemResult.stream) stopStream(systemResult.stream);
          const micStream = await acquireMic("micRoom");
          ownedStreams.push(micStream);
          // #region agent log
          dbgCapture("A", "capture.js:acquire", "system fallback micRoom", {
            missingAudioTrack: systemResult.missingAudioTrack,
            probePeak: systemResult.probePeak,
          });
          // #endregion
          return {
            stream: micStream,
            kind: "system-fallback-mic",
            release,
            captureNote: systemFallbackNote(systemResult),
          };
        }
        ownedStreams.push(systemResult.stream);
        const boosted = mixStreams(null, systemResult.stream, { systemGain: 6, micGain: 1 });
        releaseExtra = boosted.releaseExtra;
        return { stream: boosted.stream, kind, release, captureNote: "" };
      }

      if (kind === "both") {
        const micStream = await acquireMic("micRoom");
        ownedStreams.push(micStream);
        const systemResult = await acquireSystem();
        if (systemNeedsMicFallback(systemResult)) {
          if (systemResult.stream) stopStream(systemResult.stream);
          // #region agent log
          dbgCapture("A", "capture.js:acquire", "both fallback micRoom only", {
            missingAudioTrack: systemResult.missingAudioTrack,
            probePeak: systemResult.probePeak,
          });
          // #endregion
          return {
            stream: micStream,
            kind: "both-fallback-mic",
            release,
            captureNote: systemFallbackNote(systemResult),
          };
        }
        ownedStreams.push(systemResult.stream);
        const mixed = mixStreams(micStream, systemResult.stream);
        releaseExtra = mixed.releaseExtra;
        return { stream: mixed.stream, kind, release, captureNote: "" };
      }

      throw new Error(`Unknown capture source: ${source}`);
    } catch (error) {
      // #region agent log
      dbgCapture("A", "capture.js:acquire", "acquire failed", {
        kind,
        error: error?.message || String(error),
      });
      // #endregion
      release();
      throw error;
    }
  }

  global.RJCapture = {
    SOURCES,
    normalizeSource,
    systemAudioSupported,
    acquire,
  };
})(window);
