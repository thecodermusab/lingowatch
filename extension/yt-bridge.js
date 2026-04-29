// Runs in the page's MAIN world (configured in manifest.json) so it can read
// window.ytInitialPlayerResponse. The content script lives in an isolated
// world and can't see that variable, so we postMessage the caption track
// list across the world boundary on every YouTube SPA navigation.
(function () {
  const TAG = "lw-yt-caption-tracks";

  function publish() {
    try {
      const response = window.ytInitialPlayerResponse;
      const videoId = response?.videoDetails?.videoId;
      const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!videoId || !Array.isArray(tracks) || !tracks.length) return;

      const minimal = tracks.map((t) => ({
        baseUrl: t.baseUrl,
        languageCode: t.languageCode,
        kind: t.kind,
        vssId: t.vssId,
        name: t.name,
      }));

      window.postMessage({ type: TAG, videoId, tracks: minimal }, window.location.origin);
    } catch (_e) {
      // Ignore — the page might still be initializing.
    }
  }

  publish();
  window.addEventListener("yt-navigate-finish", () => setTimeout(publish, 200));
  window.addEventListener("yt-page-data-updated", () => setTimeout(publish, 100));
  // YouTube emits these when the player response is ready.
  window.addEventListener("yt-player-updated", () => setTimeout(publish, 50));
  // Belt-and-suspenders: re-publish for the first 10 seconds of a navigation
  // because YouTube sometimes mounts the player response after the events fire.
  let pulses = 0;
  const interval = setInterval(() => {
    publish();
    pulses += 1;
    if (pulses > 20) clearInterval(interval);
  }, 500);
  window.addEventListener("yt-navigate-start", () => {
    pulses = 0;
  });
})();
