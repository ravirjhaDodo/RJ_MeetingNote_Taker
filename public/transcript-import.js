(function initTranscriptImport(global) {
  function stripVttTags(text) {
    return String(text || "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
  }

  function extractVttSpeaker(text) {
    const match = String(text || "").match(/<v\s+([^>]+)>/i);
    return match ? match[1].trim() : "";
  }

  function parseVttTimestamp(value) {
    const parts = String(value || "").trim().split(":");
    if (parts.length < 2) return null;
    const secondsPart = parts.pop();
    const [sec, ms = "0"] = secondsPart.split(".");
    const hours = parts.length === 2 ? Number(parts[0]) : 0;
    const minutes = Number(parts[parts.length - 1]);
    const totalMs = ((hours * 60 + minutes) * 60 + Number(sec)) * 1000 + Number(ms.padEnd(3, "0").slice(0, 3));
    if (!Number.isFinite(totalMs)) return null;
    return new Date(totalMs);
  }

  function parseZoomBlockFormat(text) {
    const lines = String(text || "").split(/\r?\n/);
    const items = [];
    let i = 0;

    while (i < lines.length) {
      const speakerMatch = lines[i].trim().match(/^Speaker\s+(\d+)$/i);
      if (!speakerMatch) {
        i += 1;
        continue;
      }
      const speaker = `Speaker ${speakerMatch[1]}`;
      i += 1;
      if (i >= lines.length) break;

      const timeMatch = lines[i].trim().match(/^(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?|\d{1,2}:\d{2}\s*(?:AM|PM)?)$/i);
      let timestamp = null;
      if (timeMatch) {
        timestamp = parseZoomTimeToDate(timeMatch[1]);
        i += 1;
      }

      const textLines = [];
      while (i < lines.length) {
        const next = lines[i].trim();
        if (!next) {
          i += 1;
          break;
        }
        if (/^Speaker\s+\d+$/i.test(next)) break;
        textLines.push(next);
        i += 1;
      }

      const combined = textLines.join(" ").replace(/\s+/g, " ").trim();
      if (combined) {
        items.push({ speaker, text: combined, timestamp });
      }
    }

    return items;
  }

  function parseZoomTimeToDate(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] || 0);
    const now = new Date();
    now.setHours(hours, minutes, seconds, 0);
    return now;
  }

  function parseVtt(content) {
    const text = String(content || "").replace(/^\uFEFF/, "");
    const blocks = text.split(/\n\s*\n/);
    const items = [];

    for (const block of blocks) {
      const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (!lines.length || /^WEBVTT/i.test(lines[0])) continue;

      let cursor = 0;
      if (/^\d+$/.test(lines[0])) cursor = 1;
      const timingLine = lines[cursor];
      const timingMatch = timingLine?.match(
        /^(\d{2}:\d{2}(?::\d{2})?(?:\.\d{3})?)\s*-->\s*(\d{2}:\d{2}(?::\d{2})?(?:\.\d{3})?)/,
      );
      if (!timingMatch) continue;

      const timestamp = parseVttTimestamp(timingMatch[1]);
      const bodyLines = lines.slice(cursor + 1);
      const rawBody = bodyLines.join(" ").trim();
      if (!rawBody) continue;

      const speaker = extractVttSpeaker(rawBody);
      const cleaned = stripVttTags(rawBody);
      if (!cleaned) continue;

      items.push({
        speaker: speaker || "Speaker 1",
        text: cleaned,
        timestamp,
      });
    }

    return items;
  }

  function parseNameColonLines(content) {
    const items = [];
    const lines = String(content || "").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^([^:]{2,64}):\s*(.+)$/);
      if (!match) continue;
      const speaker = match[1].trim();
      const text = match[2].trim();
      if (!text) continue;
      items.push({ speaker, text, timestamp: null });
    }
    return items;
  }

  function parseTranscript(content, filename = "") {
    const text = String(content || "");
    const lowerName = String(filename || "").toLowerCase();
    const isVtt = lowerName.endsWith(".vtt") || lowerName.endsWith(".webvtt") || /^WEBVTT/m.test(text);

    if (isVtt) {
      const vttItems = parseVtt(text);
      if (vttItems.length) return vttItems;
    }

    const zoomItems = parseZoomBlockFormat(text);
    if (zoomItems.length) return zoomItems;

    const colonItems = parseNameColonLines(text);
    if (colonItems.length) return colonItems;

    const fallbackLines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^WEBVTT/i.test(line) && !/^\d{2}:\d{2}/.test(line));
    return fallbackLines.map((line) => ({ speaker: "Speaker 1", text: line, timestamp: null }));
  }

  global.RJTranscriptImport = {
    parseTranscript,
    parseVtt,
    parseZoomBlockFormat,
  };
})(window);
