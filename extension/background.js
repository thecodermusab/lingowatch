const DEFAULT_API_BASE_URL = "http://127.0.0.1:3001";
const DEFAULT_APP_BASE_URL = "http://127.0.0.1:8080";
const IMPORT_MENU_ID = "lingowatch-import-page";
const IMPORT_MENU_ALT_ID = "lingowatch-import-page-alt";

// Cache subtitle URLs found per tab
const subtitleUrls = {};

chrome.runtime.onInstalled.addListener(() => {
  createImportContextMenus();
  console.log("LingoWatch background ready");
});

chrome.runtime.onStartup?.addListener(() => {
  createImportContextMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === IMPORT_MENU_ID || info.menuItemId === IMPORT_MENU_ALT_ID) {
    void handleImportContextMenu(tab);
  }
});

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

  if (msg.type === "SET_IMPORT_SESSION") {
    chrome.storage.local.set({
      importSession: normalizeImportSession(msg.session),
    }, () => {
      sendResponse({ ok: true });
    });
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
    return true;
  }

  if (msg.type === "TRANSLATE") {
    const text = msg.text || "";
    const target = msg.target || "so";

    chrome.storage.local.get(["googleApiKey"], async (result) => {
      const apiKey = result.googleApiKey || "";

      try {
        const resp = await fetch("http://127.0.0.1:3001/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, source: "en", target }),
        });
        const data = await resp.json().catch(() => ({}));
        const translation = Array.isArray(data?.translations)
          ? String(data.translations[0] || "").trim()
          : "";
        if (translation && !isMyMemoryWarning(translation)) {
          sendResponse({ translation });
          return;
        }
      } catch (_e) {}

      if (apiKey) {
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
          sendResponse({ translation: isMyMemoryWarning(translation) ? "" : translation });
        } catch (e) {
          sendResponse({ translation: "", error: String(e) });
        }
      } else {
        try {
          const resp = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${target}`
          );
          const data = await resp.json();
          const translation =
            data.responseData?.translatedText?.trim() || "";
          sendResponse({ translation: isMyMemoryWarning(translation) ? "" : translation });
        } catch (e) {
          sendResponse({ translation: "", error: String(e) });
        }
      }
    });

    return true;
  }
});

function isMyMemoryWarning(value) {
  return String(value || "").trim().toUpperCase().startsWith("MYMEMORY WARNING");
}

function createImportContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: IMPORT_MENU_ID,
      title: "Import to My Texts",
      contexts: ["page", "selection"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });

    chrome.contextMenus.create({
      id: IMPORT_MENU_ALT_ID,
      title: "Import page to Lingowatch",
      contexts: ["page", "selection"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
  });
}

async function handleImportContextMenu(tab) {
  if (!tab?.id || !tab.url) {
    return;
  }

  if (!/^https?:/i.test(tab.url)) {
    await showPageToast(tab.id, "This page type can’t be imported.", "error");
    return;
  }

  const session = await getImportSession();
  if (!session) {
    await showPageToast(tab.id, "Connect Lingowatch first to import webpages.", "error");
    await openConnectFlow();
    return;
  }

  try {
    await showPageToast(tab.id, "Importing page to My Texts...", "info");

    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractReadablePagePayload,
    });

    const payload = result?.[0]?.result;
    if (!payload || !payload.plainText || payload.wordCount < 40) {
      throw new Error("This page does not expose enough readable article content to import.");
    }

    const response = await fetch(`${session.apiBaseUrl}/api/imported-texts/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      await clearImportSession();
      await showPageToast(tab.id, "Your Lingowatch session expired. Reconnect the extension.", "error");
      await openConnectFlow(session.appBaseUrl);
      return;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `Import failed with status ${response.status}`);
    }

    const message = data.unchanged
      ? "Already in My Texts"
      : data.updated
        ? "Imported page updated"
        : "Imported to My Texts";

    await showPageToast(tab.id, message, "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not import this page.";
    await showPageToast(tab.id, message, "error");
  }
}

function getImportSession() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["importSession"], (result) => {
      const session = normalizeImportSession(result.importSession);
      const expired = !session || (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now());
      if (expired) {
        resolve(null);
        return;
      }
      resolve(session);
    });
  });
}

function clearImportSession() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(["importSession"], () => resolve());
  });
}

async function openConnectFlow(appBaseUrl = DEFAULT_APP_BASE_URL) {
  const discoveredBaseUrl = await findOpenAppBaseUrl();
  const normalizedBase = String(discoveredBaseUrl || appBaseUrl || DEFAULT_APP_BASE_URL).replace(/\/$/, "");
  await chrome.tabs.create({
    url: `${normalizedBase}/media?tab=my_texts&connect_extension=1`,
  });
}

function normalizeImportSession(session) {
  if (!session || typeof session !== "object") return null;

  const token = String(session.token || "").trim();
  if (!token) return null;

  return {
    token,
    expiresAt: String(session.expiresAt || "").trim(),
    apiBaseUrl: String(session.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/$/, ""),
    appBaseUrl: String(session.appBaseUrl || DEFAULT_APP_BASE_URL).replace(/\/$/, ""),
    user: session.user || null,
  };
}

async function showPageToast(tabId, message, tone) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: renderImportToast,
      args: [message, tone],
    });
  } catch (_error) {
    // Ignore toast failures on restricted pages.
  }
}

function findOpenAppBaseUrl() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: ["http://127.0.0.1/*", "http://localhost/*"] }, (tabs) => {
      const appTab = tabs.find((tab) => {
        try {
          const url = new URL(tab.url || "");
          return /^\/(media|dashboard|library|stories|review|settings|watch|read)/.test(url.pathname);
        } catch (_error) {
          return false;
        }
      });

      if (!appTab?.url) {
        resolve("");
        return;
      }

      try {
        resolve(new URL(appTab.url).origin);
      } catch (_error) {
        resolve("");
      }
    });
  });
}

function renderImportToast(message, tone) {
  const existing = document.getElementById("__lingowatch-import-toast");
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement("div");
  toast.id = "__lingowatch-import-toast";
  toast.textContent = String(message || "Import finished");

  const palette = {
    success: {
      background: "linear-gradient(135deg, rgba(79,181,162,0.96), rgba(45,125,110,0.96))",
      border: "rgba(126, 233, 214, 0.35)",
    },
    error: {
      background: "linear-gradient(135deg, rgba(196,66,84,0.96), rgba(117,38,54,0.96))",
      border: "rgba(255, 189, 198, 0.3)",
    },
    info: {
      background: "linear-gradient(135deg, rgba(31,41,55,0.96), rgba(17,24,39,0.96))",
      border: "rgba(255,255,255,0.14)",
    },
  }[tone] || {
    background: "linear-gradient(135deg, rgba(31,41,55,0.96), rgba(17,24,39,0.96))",
    border: "rgba(255,255,255,0.14)",
  };

  Object.assign(toast.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    zIndex: "2147483647",
    maxWidth: "360px",
    padding: "13px 16px",
    borderRadius: "16px",
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: "white",
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: "13px",
    lineHeight: "1.45",
    boxShadow: "0 18px 42px rgba(0,0,0,0.34)",
    opacity: "0",
    transform: "translateY(8px)",
    transition: "opacity 180ms ease, transform 180ms ease",
  });

  document.documentElement.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    window.setTimeout(() => {
      toast.remove();
    }, 180);
  }, 2800);
}

function extractReadablePagePayload() {
  const blockedSelector = [
    "script",
    "style",
    "noscript",
    "svg",
    "canvas",
    "iframe",
    "form",
    "button",
    "input",
    "textarea",
    "select",
    "nav",
    "footer",
    "header",
    "aside",
    "dialog",
    "[aria-hidden='true']",
    "[hidden]",
    ".ad",
    ".ads",
    ".advert",
    ".advertisement",
    ".cookie",
    ".cookies",
    ".cookie-banner",
    ".newsletter",
    ".popup",
    ".modal",
    ".comments",
    ".comment",
    ".share",
    ".social",
    ".related",
    ".recommended",
    ".sidebar",
    ".subscribe",
    ".subscription",
    "#comments",
    "#sidebar",
    "#footer",
  ].join(",");

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;!?])/g, "$1")
      .trim();
  }

  function absoluteUrl(value) {
    if (!value) return "";
    try {
      return new URL(value, location.href).toString();
    } catch (_error) {
      return "";
    }
  }

  function extractJsonLdMetadata() {
    const scripts = Array.from(document.querySelectorAll("script[type='application/ld+json']"));
    for (const script of scripts) {
      try {
        const raw = JSON.parse(script.textContent || "null");
        const items = Array.isArray(raw) ? raw : Array.isArray(raw?.["@graph"]) ? raw["@graph"] : [raw];
        for (const item of items) {
          if (!item || typeof item !== "object") continue;
          const typeValue = Array.isArray(item["@type"]) ? item["@type"].join(",") : item["@type"];
          const looksArticle = /Article|NewsArticle|BlogPosting|TechArticle|Report/i.test(String(typeValue || ""));
          if (!looksArticle) continue;
          const authorName = typeof item.author?.name === "string"
            ? item.author.name
            : Array.isArray(item.author)
              ? item.author.map((entry) => entry?.name).find(Boolean)
              : typeof item.author === "string"
                ? item.author
                : "";
          const image = Array.isArray(item.image) ? item.image[0] : item.image?.url || item.image;
          return {
            title: normalizeText(item.headline || item.name),
            author: normalizeText(authorName),
            publishedAt: normalizeText(item.datePublished || item.dateCreated),
            thumbnailUrl: absoluteUrl(image),
          };
        }
      } catch (_error) {
        // Ignore malformed ld+json payloads.
      }
    }
    return {};
  }

  function scoreNode(node) {
    if (!(node instanceof HTMLElement)) return -1;
    const text = normalizeText(node.innerText || node.textContent || "");
    if (text.length < 250) return -1;

    const paragraphCount = node.querySelectorAll("p").length;
    const headingCount = node.querySelectorAll("h1,h2,h3").length;
    const linkTextLength = Array.from(node.querySelectorAll("a")).reduce((sum, link) => sum + normalizeText(link.textContent || "").length, 0);
    const linkDensity = text.length ? linkTextLength / text.length : 0;
    const className = `${node.className || ""} ${node.id || ""}`.toLowerCase();
    const penalty = /(comment|share|social|footer|header|related|sidebar|promo|banner|cookie|popup|nav)/.test(className) ? 200 : 0;
    const tagBonus = /^(article|main)$/i.test(node.tagName) ? 220 : 0;

    return text.length + paragraphCount * 90 + headingCount * 40 + tagBonus - linkDensity * 320 - penalty;
  }

  function selectBestRoot() {
    const preferredSelectors = [
      "article",
      "main",
      "[role='main']",
      "[itemprop='articleBody']",
      ".article-content",
      ".post-content",
      ".entry-content",
      ".content",
      ".article",
      ".post",
    ];

    const candidates = [];
    preferredSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => candidates.push(node));
    });

    Array.from(document.body?.children || []).forEach((node) => candidates.push(node));
    candidates.push(document.body);

    let bestNode = document.body;
    let bestScore = -Infinity;

    candidates.forEach((candidate) => {
      const score = scoreNode(candidate);
      if (score > bestScore) {
        bestScore = score;
        bestNode = candidate;
      }
    });

    return bestNode || document.body;
  }

  function cleanNode(root) {
    if (!(root instanceof HTMLElement)) return root;
    root.querySelectorAll(blockedSelector).forEach((node) => node.remove());

    root.querySelectorAll("*").forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const text = normalizeText(node.innerText || node.textContent || "");
      const className = `${node.className || ""} ${node.id || ""}`.toLowerCase();
      const linkText = Array.from(node.querySelectorAll("a")).reduce((sum, link) => sum + normalizeText(link.textContent || "").length, 0);
      const linkDensity = text.length ? linkText / text.length : 0;
      if (/(comment|share|social|related|recommend|cookie|popup|modal|promo|banner|ad)/.test(className) && text.length < 600) {
        node.remove();
        return;
      }
      if (linkDensity > 0.55 && text.length < 350) {
        node.remove();
      }
    });

    return root;
  }

  function elementToBlock(element) {
    const tagName = element.tagName.toUpperCase();

    if (tagName === "UL" || tagName === "OL") {
      const items = Array.from(element.querySelectorAll(":scope > li"))
        .map((item) => normalizeText(item.innerText || item.textContent || ""))
        .filter((item) => item.length > 8);

      return items.length ? { type: "list", items } : null;
    }

    const text = normalizeText(element.innerText || element.textContent || "");
    if (!text || text.length < 18) return null;

    if (tagName.startsWith("H")) {
      return {
        type: "heading",
        level: Math.min(4, Math.max(1, Number(tagName.slice(1)) || 2)),
        text,
      };
    }

    if (tagName === "BLOCKQUOTE" || tagName === "PRE") {
      return { type: "quote", text };
    }

    return { type: "paragraph", text };
  }

  function collectBlocks(node, blocks) {
    if (!(node instanceof HTMLElement)) return;

    const tagName = node.tagName.toUpperCase();
    if (["P", "BLOCKQUOTE", "PRE", "UL", "OL", "H1", "H2", "H3", "H4"].includes(tagName)) {
      const block = elementToBlock(node);
      if (block) blocks.push(block);
      return;
    }

    Array.from(node.children).forEach((child) => collectBlocks(child, blocks));
  }

  function compressBlocks(blocks) {
    const nextBlocks = [];

    blocks.forEach((block) => {
      const last = nextBlocks[nextBlocks.length - 1];
      if (!block) return;
      if (block.type === "paragraph" && last?.type === "paragraph") {
        const merged = `${last.text} ${block.text}`.trim();
        if (merged.length <= 1200) {
          last.text = merged;
          return;
        }
      }
      if (block.type === "list" && last?.type === "list") {
        last.items = [...last.items, ...block.items].slice(0, 24);
        return;
      }
      nextBlocks.push(block);
    });

    return nextBlocks;
  }

  function buildPlainText(blocks) {
    return blocks
      .map((block) => {
        if (block.type === "list") {
          return block.items.join("\n");
        }
        return block.text;
      })
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  function countWords(text) {
    const matches = String(text || "").match(/\b[\p{L}\p{N}'’-]+\b/gu);
    return matches ? matches.length : 0;
  }

  const jsonLd = extractJsonLdMetadata();
  const root = cleanNode(selectBestRoot().cloneNode(true));
  let blocks = [];
  collectBlocks(root, blocks);
  blocks = compressBlocks(blocks);

  if (!blocks.length) {
    const fallbackRoot = cleanNode(document.body.cloneNode(true));
    collectBlocks(fallbackRoot, blocks);
    blocks = compressBlocks(blocks);
  }

  const plainText = buildPlainText(blocks);
  const title =
    normalizeText(
      document.querySelector("meta[property='og:title']")?.getAttribute("content") ||
      jsonLd.title ||
      document.querySelector("meta[name='twitter:title']")?.getAttribute("content") ||
      document.querySelector("h1")?.textContent ||
      document.title
    ) || document.title || location.hostname;

  const author =
    normalizeText(
      document.querySelector("meta[name='author']")?.getAttribute("content") ||
      document.querySelector("meta[property='article:author']")?.getAttribute("content") ||
      jsonLd.author ||
      document.querySelector("[rel='author']")?.textContent ||
      document.querySelector(".byline, .article-byline, [itemprop='author']")?.textContent
    );

  const publishedAt =
    normalizeText(
      document.querySelector("meta[property='article:published_time']")?.getAttribute("content") ||
      document.querySelector("meta[name='pubdate']")?.getAttribute("content") ||
      jsonLd.publishedAt ||
      document.querySelector("time[datetime]")?.getAttribute("datetime")
    );

  const favIconUrl = absoluteUrl(
    document.querySelector("link[rel='icon']")?.getAttribute("href") ||
    document.querySelector("link[rel='shortcut icon']")?.getAttribute("href") ||
    document.querySelector("link[rel='apple-touch-icon']")?.getAttribute("href")
  );

  const thumbnailUrl = absoluteUrl(
    document.querySelector("meta[property='og:image']")?.getAttribute("content") ||
    document.querySelector("meta[name='twitter:image']")?.getAttribute("content") ||
    jsonLd.thumbnailUrl
  );

  const host = location.hostname.replace(/^www\./, "");
  const hostParts = host.split(".");
  const sourceBase = hostParts.length > 2 ? hostParts[hostParts.length - 2] : hostParts[0];
  const sourceName = sourceBase
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return {
    title,
    sourceName: sourceName || host,
    sourceUrl: location.href,
    author,
    publishedAt,
    favIconUrl,
    thumbnailUrl,
    language: document.documentElement.lang || "",
    readableHtml: root instanceof HTMLElement ? root.innerHTML.slice(0, 150000) : "",
    blocks,
    plainText,
    wordCount: countWords(plainText),
    excerpt: plainText.slice(0, 240),
  };
}
