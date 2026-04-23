(function initLingoWatchAppBridge() {
  try {
    if (!chrome?.runtime?.id || window.__lingowatchAppBridgeLoaded) return;
  } catch (_error) {
    return;
  }

  window.__lingowatchAppBridgeLoaded = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || typeof event.data.type !== "string") {
      return;
    }
    if (event.origin !== window.location.origin) {
      return;
    }

    if (event.data.type === "LINGOWATCH_EXTENSION_PING") {
      window.postMessage({ type: "LINGOWATCH_EXTENSION_PONG" }, "*");
      return;
    }

    if (event.data.type === "LINGOWATCH_EXTENSION_SESSION") {
      chrome.runtime.sendMessage(
        {
          type: "SET_IMPORT_SESSION",
          session: event.data.payload || null,
        },
        () => {
          window.postMessage({ type: "LINGOWATCH_EXTENSION_SESSION_ACK" }, "*");
        }
      );
    }
  });
})();
