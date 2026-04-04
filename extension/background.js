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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_SUBTITLE_URLS") {
    sendResponse({ urls: subtitleUrls[sender.tab?.id] || [] });
    return true;
  }
});
