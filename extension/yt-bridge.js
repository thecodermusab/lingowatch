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
  if (window.__lwYtBridgeLoaded) return;
  window.__lwYtBridgeLoaded = true;

  const TAG_TRACKS = "lw-yt-caption-tracks";
  const TAG_TEXT = "lw-yt-caption-text";
  const TAG_HELLO = "lw-yt-bridge-hello";

  // Heartbeat the content script can listen for so it knows the bridge is
  // actually running (vs. silently blocked by CSP / world isolation).
  window.postMessage({ type: TAG_HELLO }, window.location.origin);

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
    // Mark as in-progress; we'll clear if all variants fail so a later pulse can retry.
    _publishedFor.add(videoId);

    // Try several URL variants. YouTube serves different formats depending
    // on the &fmt=, and an empty body for one variant doesn't always mean
    // the others are empty.
    const variants = [
      chosen.baseUrl + (chosen.baseUrl.includes("fmt=") ? "" : "&fmt=json3"),
      chosen.baseUrl + (chosen.baseUrl.includes("fmt=") ? "" : "&fmt=srv1"),
      chosen.baseUrl + (chosen.baseUrl.includes("fmt=") ? "" : "&fmt=srv3"),
      chosen.baseUrl,
    ];

    // Headers that match what YouTube's own player sends when fetching
    // captions. Some servers reject requests without these.
    const headers = {
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
    };

    for (const url of variants) {
      try {
        const res = await fetch(url, { credentials: "include", headers });
        if (!res.ok) continue;
        const text = await res.text();
        if (!text || text.length < 10) continue;
        window.postMessage(
          { type: TAG_TEXT, videoId, languageCode: chosen.languageCode || "en", body: text },
          window.location.origin,
        );
        _publishedFor.add(videoId);
        return;
      } catch (_e) {
        // try next URL
      }
    }

    // All variants failed — undo the published flag so a later retry can try again.
    _publishedFor.delete(videoId);
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
