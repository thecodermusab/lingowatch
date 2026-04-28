// Single source of truth for extension API/app URLs.
// Loaded as a classic script in both the background service worker
// (via importScripts) and as the first content script in the manifest,
// so it sets globalThis.LINGOWATCH_CONFIG before any other code runs.
(function () {
  // Until api.maahir03.me is deployed, point at the existing maahir03.me
  // origin which already serves /api/transcript, /api/translate, etc.
  // After the DigitalOcean api component is live, flip API_BASE_URL to
  // "https://api.maahir03.me" — that single change here is enough.
  const config = {
    API_BASE_URL: "https://maahir03.me",
    APP_BASE_URL: "https://maahir03.me",
  };
  if (typeof globalThis !== "undefined") {
    globalThis.LINGOWATCH_CONFIG = config;
  }
})();
