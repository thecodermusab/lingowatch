chrome.runtime.onInstalled.addListener(() => {
  console.log("LingoWatch background ready");
});

// Cache subtitle URLs found per tab
const subtitleUrls = {};

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) {
      return;
    }

    const url = details.url;
    const lower = url.toLowerCase();

    const isSubtitle =
      /\.(vtt|srt)(\?|#|$)/i.test(url) ||
      lower.includes("subtitle") ||
      lower.includes("caption");

    if (!isSubtitle) {
      return;
    }

    if (!subtitleUrls[details.tabId]) {
      subtitleUrls[details.tabId] = [];
    }

    if (!subtitleUrls[details.tabId].includes(url)) {
      subtitleUrls[details.tabId].push(url);

      chrome.tabs.sendMessage(details.tabId, {
        type: "SUBTITLE_URL_FOUND",
        url
      }).catch(() => {});
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  delete subtitleUrls[tabId];
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" || typeof changeInfo.url === "string") {
    subtitleUrls[tabId] = [];
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_SUBTITLE_URLS") {
    sendResponse({ urls: subtitleUrls[sender.tab?.id] || [] });
    return true;
  }

  if (msg.type === "FETCH_TATOEBA") {
    const word = String(msg.word || "").trim();
    if (!word) { sendResponse({ results: [] }); return true; }
    fetch(`https://tatoeba.org/en/api_v0/search?query=${encodeURIComponent(word)}&from=eng&limit=10`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const results = (data?.results || [])
          .filter(s => s.text && s.lang === "eng")
          .slice(0, 4)
          .map(s => ({
            text: s.text,
            audioUrl: (s.audios && s.audios.length > 0)
              ? `https://audio.tatoeba.org/sentences/${s.lang}/${s.id}.mp3`
              : null,
          }));
        sendResponse({ results });
      })
      .catch(() => sendResponse({ results: [] }));
    return true; // keep channel open for async sendResponse
  }

  if (msg.type === "TRANSLATE") {
    const text = msg.text || "";
    const target = msg.target || "so";

    chrome.storage.local.get(["googleApiKey"], async (result) => {
      const apiKey = result.googleApiKey || "";

      if (apiKey) {
        // Google Translate Cloud API v2
        try {
          const resp = await fetch(
            `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ q: text, target, format: "text" }),
            }
          );
          const data = await resp.json();
          const translation =
            data.data?.translations?.[0]?.translatedText?.trim() || "";
          sendResponse({ translation });
        } catch (e) {
          sendResponse({ translation: "", error: String(e) });
        }
      } else {
        // Fallback: MyMemory (free, no key)
        try {
          const resp = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${target}`
          );
          const data = await resp.json();
          const translation =
            data.responseData?.translatedText?.trim() || "";
          sendResponse({ translation });
        } catch (e) {
          sendResponse({ translation: "", error: String(e) });
        }
      }
    });

    return true; // keep channel open for async sendResponse
  }
});
