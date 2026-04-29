// Runs in the page's MAIN world (loaded via a script tag injected from
// content.js). Two responsibilities:
//   1. Publish the captionTracks list so the content script knows what's
//      available without having to read window.ytInitialPlayerResponse from
//      its isolated world.
//   2. Fetch the chosen English caption track itself, in MAIN world. The
//      isolated-world fetch hits YouTube's anti-bot and gets back 200/0-bytes,
//      while a fetch from the page context succeeds because cookies and the
//      page-session fingerprint flow naturally.
(function () {
  const TAG_TRACKS = "lw-yt-caption-tracks";
  const TAG_TEXT = "lw-yt-caption-text";

  const _publishedFor = new Set(); // videoId(s) we've already auto-fetched
  const _publishedTracksFor = new Set();

  function pickEnglishTrack(tracks) {
    if (!Array.isArray(tracks) || !tracks.length) return null;
    return (
      tracks.find((t) => /^en([_-]|$)/i.test(t.languageCode || "") && t.kind !== "asr") ||
      tracks.find((t) => /^en([_-]|$)/i.test(t.languageCode || "")) ||
      tracks.find((t) => /\.en/i.test(t.vssId || "")) ||
      tracks.find((t) => /english/i.test(t.name?.simpleText || "")) ||
      tracks[0]
    );
  }

  function publishTracks(videoId, tracks) {
    if (!videoId || !Array.isArray(tracks) || !tracks.length) return;
    if (_publishedTracksFor.has(videoId)) return;
    _publishedTracksFor.add(videoId);
    const minimal = tracks.map((t) => ({
      baseUrl: t.baseUrl,
      languageCode: t.languageCode,
      kind: t.kind,
      vssId: t.vssId,
      name: t.name,
    }));
    window.postMessage({ type: TAG_TRACKS, videoId, tracks: minimal }, window.location.origin);
  }

  async function publishCaptionText(videoId, tracks) {
    if (_publishedFor.has(videoId)) return;
    const chosen = pickEnglishTrack(tracks);
    if (!chosen?.baseUrl) return;
    _publishedFor.add(videoId);

    // Try json3 first (cleaner to parse). If it 404s, fall back to the
    // raw signed URL which YouTube's player uses.
    const urls = [
      chosen.baseUrl + (chosen.baseUrl.includes("fmt=") ? "" : "&fmt=json3"),
      chosen.baseUrl,
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) continue;
        const text = await res.text();
        if (!text) continue;
        window.postMessage(
          { type: TAG_TEXT, videoId, languageCode: chosen.languageCode || "en", body: text },
          window.location.origin,
        );
        return;
      } catch (_e) {
        // try next URL
      }
    }
  }

  function publish() {
    try {
      const response = window.ytInitialPlayerResponse;
      const videoId = response?.videoDetails?.videoId;
      const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!videoId || !Array.isArray(tracks) || !tracks.length) return;
      publishTracks(videoId, tracks);
      publishCaptionText(videoId, tracks);
    } catch (_e) {
      // Ignore — the page might still be initializing.
    }
  }

  publish();
  window.addEventListener("yt-navigate-finish", () => setTimeout(publish, 200));
  window.addEventListener("yt-page-data-updated", () => setTimeout(publish, 100));
  window.addEventListener("yt-player-updated", () => setTimeout(publish, 50));

  // Repeated pulses for the first few seconds of every navigation, because
  // the player response is sometimes mounted after the events above fire.
  let pulses = 0;
  let interval = setInterval(() => {
    publish();
    pulses += 1;
    if (pulses > 24) {
      clearInterval(interval);
      interval = null;
    }
  }, 500);
  window.addEventListener("yt-navigate-start", () => {
    pulses = 0;
    if (!interval) {
      interval = setInterval(() => {
        publish();
        pulses += 1;
        if (pulses > 24) {
          clearInterval(interval);
          interval = null;
        }
      }, 500);
    }
  });
})();
