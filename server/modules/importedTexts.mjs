import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import sanitizeHtml from "sanitize-html";
import { JSDOM } from "jsdom";

const ROOT_DIR = cwd();
const DATA_DIR = join(ROOT_DIR, "server", "data");
const IMPORTED_TEXTS_FILE = join(DATA_DIR, "imported-texts.json");
const IMPORT_SESSIONS_FILE = join(DATA_DIR, "imported-text-sessions.json");

const BLOCK_TAGS = new Set(["P", "BLOCKQUOTE", "PRE", "UL", "OL", "H1", "H2", "H3", "H4"]);
const CONTAINER_TAGS = new Set(["ARTICLE", "SECTION", "DIV", "MAIN", "ASIDE"]);
const BLOCKED_SELECTOR = [
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
  ".promo",
  ".share",
  ".social",
  ".comment",
  ".comments",
  ".related",
  ".recommend",
  ".recommended",
  ".sidebar",
  ".toolbar",
  ".subscription",
  ".subscribe",
  "#comments",
  "#footer",
  "#header",
  "#sidebar",
].join(",");

const DEFAULT_SORT = "newest";

export async function handleImportedTextRoutes(req, res, pathname, url, sendJson, readJsonBody) {
  if (req.method === "POST" && pathname === "/api/imported-texts/session") {
    try {
      const body = await readJsonBody(req);
      const userId = normalizeUserId(body?.userId);

      if (!userId) {
        sendJson(res, 400, { error: "userId is required" });
        return true;
      }

      const session = createImportSession({
        userId,
        email: normalizeText(body?.email),
        fullName: normalizeText(body?.fullName),
      });

      sendJson(res, 200, {
        token: session.token,
        expiresAt: session.expiresAt,
        user: {
          userId: session.userId,
          email: session.email,
          fullName: session.fullName,
        },
      });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Could not create import session" });
    }
    return true;
  }

  if (req.method === "GET" && pathname === "/api/imported-texts") {
    try {
      const userId = normalizeUserId(url.searchParams.get("userId"));
      if (!userId) {
        sendJson(res, 400, { error: "userId is required" });
        return true;
      }

      const search = normalizeText(url.searchParams.get("search"));
      const source = normalizeText(url.searchParams.get("source"));
      const sort = normalizeSort(url.searchParams.get("sort"));
      const status = normalizeStatusFilter(url.searchParams.get("status"));
      const store = loadImportedTextsStore();
      const userItems = store.texts.filter((item) => item.userId === userId);
      const availableSources = Array.from(new Set(userItems.map((item) => item.sourceName).filter(Boolean))).sort((a, b) => a.localeCompare(b));

      const filtered = userItems
        .filter((item) => {
          if (source && item.sourceName !== source) return false;
          if (status && item.status !== status) return false;
          if (!search) return true;

          const haystack = [
            item.title,
            item.sourceName,
            item.author,
            item.sourceUrl,
            item.previewText,
            item.plainText,
          ]
            .filter(Boolean)
            .join("\n")
            .toLowerCase();

          return haystack.includes(search.toLowerCase());
        })
        .sort((left, right) => compareImportedTexts(left, right, sort));

      sendJson(res, 200, {
        items: filtered.map((item) => summarizeImportedText(item)),
        availableSources,
        total: filtered.length,
      });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Could not load imported texts" });
    }
    return true;
  }

  if (req.method === "POST" && pathname === "/api/imported-texts/manual") {
    try {
      const body = await readJsonBody(req);
      const userId = normalizeUserId(body?.userId);
      const title = normalizeText(body?.title);
      const manualContent = normalizeText(body?.content);

      if (!userId) {
        sendJson(res, 400, { error: "userId is required" });
        return true;
      }

      if (!title || !manualContent) {
        sendJson(res, 400, { error: "title and content are required" });
        return true;
      }

      const importedText = upsertImportedText({
        userId,
        origin: "manual",
        payload: {
          title,
          sourceUrl: normalizeUrl(body?.sourceUrl),
          sourceName: normalizeText(body?.sourceName) || "Manual text",
          author: normalizeText(body?.author),
          publishedAt: normalizeIsoDate(body?.publishedAt),
          favIconUrl: "",
          thumbnailUrl: "",
          plainText: manualContent,
          readableHtml: paragraphsToHtml(manualContent),
          blocks: textToParagraphBlocks(manualContent),
        },
      });

      sendJson(res, 200, {
        item: summarizeImportedText(importedText.item),
        created: importedText.created,
        updated: importedText.updated,
      });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Could not create manual text" });
    }
    return true;
  }

  if (req.method === "POST" && pathname === "/api/imported-texts/import") {
    try {
      const session = resolveImportSession(req);
      if (!session) {
        sendJson(res, 401, { error: "Import session is missing or invalid" });
        return true;
      }

      const body = await readJsonBody(req);
      const importedText = upsertImportedText({
        userId: session.userId,
        origin: "extension",
        payload: body,
      });

      sendJson(res, 200, {
        item: summarizeImportedText(importedText.item),
        duplicate: importedText.duplicate,
        created: importedText.created,
        updated: importedText.updated,
        unchanged: importedText.unchanged,
      });
    } catch (error) {
      sendJson(res, 422, { error: error instanceof Error ? error.message : "Could not import webpage" });
    }
    return true;
  }

  const progressMatch = pathname.match(/^\/api\/imported-texts\/([^/]+)\/progress$/);
  if (req.method === "PATCH" && progressMatch) {
    try {
      const textId = decodeURIComponent(progressMatch[1]);
      const body = await readJsonBody(req);
      const userId = normalizeUserId(body?.userId);

      if (!userId) {
        sendJson(res, 400, { error: "userId is required" });
        return true;
      }

      const store = loadImportedTextsStore();
      const index = store.texts.findIndex((item) => item.id === textId && item.userId === userId);
      if (index === -1) {
        sendJson(res, 404, { error: "Imported text not found" });
        return true;
      }

      const current = store.texts[index];
      const nextProgress = normalizeProgressUpdate(current.progress, current.sectionCount, body);
      store.texts[index] = {
        ...current,
        progress: nextProgress,
        updatedAt: new Date().toISOString(),
      };

      saveImportedTextsStore(store);
      sendJson(res, 200, { item: summarizeImportedText(store.texts[index]) });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "Could not update progress" });
    }
    return true;
  }

  const detailMatch = pathname.match(/^\/api\/imported-texts\/([^/]+)$/);
  if (detailMatch && req.method === "GET") {
    try {
      const textId = decodeURIComponent(detailMatch[1]);
      const userId = normalizeUserId(url.searchParams.get("userId"));
      if (!userId) {
        sendJson(res, 400, { error: "userId is required" });
        return true;
      }

      const store = loadImportedTextsStore();
      const item = store.texts.find((entry) => entry.id === textId && entry.userId === userId);
      if (!item) {
        sendJson(res, 404, { error: "Imported text not found" });
        return true;
      }

      sendJson(res, 200, { item });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Could not load imported text" });
    }
    return true;
  }

  if (detailMatch && req.method === "DELETE") {
    try {
      const textId = decodeURIComponent(detailMatch[1]);
      const userId = normalizeUserId(url.searchParams.get("userId"));
      if (!userId) {
        sendJson(res, 400, { error: "userId is required" });
        return true;
      }

      const store = loadImportedTextsStore();
      const nextTexts = store.texts.filter((item) => !(item.id === textId && item.userId === userId));
      if (nextTexts.length === store.texts.length) {
        sendJson(res, 404, { error: "Imported text not found" });
        return true;
      }

      saveImportedTextsStore({ texts: nextTexts });
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Could not delete imported text" });
    }
    return true;
  }

  return false;
}

function upsertImportedText({ userId, origin, payload }) {
  const sourceUrl = normalizeUrl(payload?.sourceUrl || payload?.url);
  const canonicalUrl = canonicalizeUrl(sourceUrl);
  const title = normalizeText(payload?.title);
  const store = loadImportedTextsStore();
  const existingIndex = canonicalUrl
    ? store.texts.findIndex((item) => item.userId === userId && item.canonicalUrl === canonicalUrl)
    : -1;
  const existing = existingIndex >= 0 ? store.texts[existingIndex] : null;
  const now = new Date().toISOString();
  const placeholder = existing
    ? {
        ...existing,
        status: "processing",
        updatedAt: now,
        failureReason: "",
      }
    : {
        id: crypto.randomUUID(),
        userId,
        title: title || "Untitled import",
        sourceName: normalizeText(payload?.sourceName) || inferSourceName(sourceUrl),
        sourceUrl,
        canonicalUrl,
        author: normalizeText(payload?.author),
        publishedAt: normalizeIsoDate(payload?.publishedAt),
        importedAt: now,
        updatedAt: now,
        content: { sections: [] },
        plainText: "",
        wordCount: 0,
        estimatedReadingTime: 0,
        sectionCount: 0,
        pageCount: 0,
        progress: createInitialProgress(),
        favIconUrl: normalizeUrl(payload?.favIconUrl || payload?.faviconUrl),
        thumbnailUrl: normalizeUrl(payload?.thumbnailUrl),
        status: "processing",
        previewText: "",
        language: normalizeText(payload?.language) || "en",
        origin,
        contentHash: "",
        failureReason: "",
      };

  if (existingIndex >= 0) {
    store.texts[existingIndex] = placeholder;
  } else {
    store.texts.unshift(placeholder);
  }
  saveImportedTextsStore(store);

  try {
    const normalized = normalizeImportedPayload({
      userId,
      itemId: placeholder.id,
      payload,
      sourceUrl,
      canonicalUrl,
      origin,
      existingProgress: existing?.progress,
      importedAt: now,
    });

    const unchanged = Boolean(existing?.contentHash) && existing.contentHash === normalized.contentHash;
    const nextItem = unchanged
      ? {
          ...existing,
          ...normalized,
          id: existing.id,
          progress: existing.progress,
          importedAt: now,
          updatedAt: now,
          status: "ready",
          failureReason: "",
        }
      : normalized;

    const nextStore = loadImportedTextsStore();
    const nextIndex = nextStore.texts.findIndex((item) => item.id === placeholder.id);

    if (nextIndex >= 0) {
      nextStore.texts[nextIndex] = nextItem;
    } else {
      nextStore.texts.unshift(nextItem);
    }

    saveImportedTextsStore(nextStore);
    return {
      item: nextItem,
      duplicate: Boolean(existing),
      created: !existing,
      updated: Boolean(existing) && !unchanged,
      unchanged,
    };
  } catch (error) {
    const failedStore = loadImportedTextsStore();
    const failedIndex = failedStore.texts.findIndex((item) => item.id === placeholder.id);
    if (failedIndex >= 0) {
      failedStore.texts[failedIndex] = {
        ...failedStore.texts[failedIndex],
        status: "failed",
        failureReason: error instanceof Error ? error.message : "Import failed",
        updatedAt: new Date().toISOString(),
      };
      saveImportedTextsStore(failedStore);
    }
    throw error;
  }
}

function normalizeImportedPayload({ userId, itemId, payload, sourceUrl, canonicalUrl, origin, existingProgress, importedAt }) {
  const readableHtml = normalizeText(payload?.readableHtml);
  const providedBlocks = normalizeBlocks(payload?.blocks);
  const extractedFromHtml = providedBlocks.length ? [] : extractBlocksFromHtml(readableHtml);
  const baseBlocks = providedBlocks.length ? providedBlocks : extractedFromHtml;
  const fallbackBlocks = baseBlocks.length ? baseBlocks : textToParagraphBlocks(normalizeText(payload?.plainText));
  const blocks = compressBlocks(fallbackBlocks);
  const plainText = buildPlainText(blocks, normalizeText(payload?.plainText));

  if (!plainText || countWords(plainText) < 40) {
    throw new Error("We could not extract enough readable content from this page.");
  }

  const sections = buildSections({
    title: normalizeText(payload?.title),
    blocks,
  });
  const previewText = normalizeText(payload?.excerpt) || buildPreviewText(plainText);
  const contentHash = crypto.createHash("sha256").update(`${canonicalUrl}\n${plainText}`).digest("hex");
  const sectionCount = sections.length;
  const wordCount = countWords(plainText);
  const estimatedReadingTime = estimateReadingTime(wordCount);
  const nextProgress = normalizeProgressUpdate(existingProgress ?? createInitialProgress(), sectionCount, {});

  return {
    id: itemId,
    userId,
    title: normalizeText(payload?.title) || sections[0]?.title || inferTitleFromUrl(sourceUrl),
    sourceName: normalizeText(payload?.sourceName) || inferSourceName(sourceUrl),
    sourceUrl,
    canonicalUrl,
    author: normalizeText(payload?.author),
    publishedAt: normalizeIsoDate(payload?.publishedAt),
    importedAt,
    updatedAt: importedAt,
    content: { sections },
    plainText,
    wordCount,
    estimatedReadingTime,
    sectionCount,
    pageCount: sectionCount,
    progress: nextProgress,
    favIconUrl: normalizeUrl(payload?.favIconUrl || payload?.faviconUrl),
    thumbnailUrl: normalizeUrl(payload?.thumbnailUrl),
    status: "ready",
    previewText,
    language: normalizeText(payload?.language) || "en",
    origin,
    contentHash,
    failureReason: "",
  };
}

function createImportSession({ userId, email, fullName }) {
  const sessions = loadImportSessions();
  const now = Date.now();
  const expiresAt = new Date(now + 1000 * 60 * 60 * 24 * 30).toISOString();
  const token = crypto.randomBytes(24).toString("hex");
  const nextSessions = sessions.filter((session) => session.userId !== userId && new Date(session.expiresAt).getTime() > now);

  const session = {
    token,
    userId,
    email,
    fullName,
    createdAt: new Date(now).toISOString(),
    expiresAt,
    lastUsedAt: new Date(now).toISOString(),
  };

  nextSessions.unshift(session);
  saveImportSessions(nextSessions);
  return session;
}

function resolveImportSession(req) {
  const authHeader = String(req.headers.authorization || "");
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  if (!token) return null;

  const sessions = loadImportSessions();
  const now = Date.now();
  const index = sessions.findIndex((session) => session.token === token && new Date(session.expiresAt).getTime() > now);
  if (index === -1) return null;

  const nextSessions = sessions.slice();
  nextSessions[index] = {
    ...nextSessions[index],
    lastUsedAt: new Date().toISOString(),
  };
  saveImportSessions(nextSessions);
  return nextSessions[index];
}

function loadImportedTextsStore() {
  ensureDataDir();
  if (!existsSync(IMPORTED_TEXTS_FILE)) {
    return { texts: [] };
  }

  try {
    const parsed = JSON.parse(readFileSync(IMPORTED_TEXTS_FILE, "utf8"));
    if (!Array.isArray(parsed?.texts)) {
      return { texts: [] };
    }
    return {
      texts: parsed.texts
        .filter((item) => item && typeof item === "object" && typeof item.id === "string" && typeof item.userId === "string")
        .map((item) => ({
          ...item,
          progress: normalizeProgressUpdate(item.progress, Number(item.sectionCount) || 0, {}),
          content: {
            sections: Array.isArray(item?.content?.sections) ? item.content.sections : [],
          },
        })),
    };
  } catch {
    return { texts: [] };
  }
}

function saveImportedTextsStore(store) {
  ensureDataDir();
  writeFileSync(IMPORTED_TEXTS_FILE, JSON.stringify(store, null, 2));
}

function loadImportSessions() {
  ensureDataDir();
  if (!existsSync(IMPORT_SESSIONS_FILE)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(IMPORT_SESSIONS_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed.filter((item) => item?.token && item?.userId) : [];
  } catch {
    return [];
  }
}

function saveImportSessions(sessions) {
  ensureDataDir();
  writeFileSync(IMPORT_SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function normalizeUserId(value) {
  const userId = normalizeText(value);
  return userId || "";
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";

  try {
    return new URL(url).toString();
  } catch {
    return "";
  }
}

function normalizeIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeStatusFilter(value) {
  const status = String(value || "").trim().toLowerCase();
  return ["processing", "ready", "failed"].includes(status) ? status : "";
}

function normalizeSort(value) {
  const sort = String(value || "").trim().toLowerCase();
  return ["newest", "oldest", "longest", "shortest"].includes(sort) ? sort : DEFAULT_SORT;
}

function normalizeBlocks(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((block) => normalizeBlock(block))
    .filter(Boolean);
}

function normalizeBlock(block) {
  if (!block || typeof block !== "object") return null;
  const type = String(block.type || "").trim().toLowerCase();
  if (!["heading", "paragraph", "quote", "list"].includes(type)) return null;

  if (type === "list") {
    const items = Array.isArray(block.items)
      ? block.items.map((item) => sanitizeInlineText(item)).filter(Boolean)
      : [];
    if (!items.length) return null;
    return { type, items };
  }

  const text = sanitizeInlineText(block.text);
  if (!text) return null;

  if (type === "heading") {
    const level = Math.min(4, Math.max(1, Number(block.level) || 2));
    return { type, text, level };
  }

  return { type, text };
}

function sanitizeInlineText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
}

function compressBlocks(blocks) {
  const nextBlocks = [];

  for (const block of blocks) {
    if (!block) continue;
    const last = nextBlocks[nextBlocks.length - 1];

    if (block.type === "paragraph" && last?.type === "paragraph") {
      const mergedText = `${last.text} ${block.text}`.trim();
      if (mergedText.length <= 1200) {
        last.text = mergedText;
        continue;
      }
    }

    if (block.type === "list" && last?.type === "list") {
      last.items = [...last.items, ...block.items].slice(0, 24);
      continue;
    }

    nextBlocks.push(block);
  }

  return nextBlocks;
}

function extractBlocksFromHtml(html) {
  if (!html) return [];

  const cleanHtml = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "time", "article", "main", "section", "figure", "figcaption"]),
    allowedAttributes: {
      a: ["href"],
      img: ["src", "alt"],
      time: ["datetime"],
      "*": ["class", "id"],
    },
  });

  const dom = new JSDOM(`<body>${cleanHtml}</body>`);
  const { document } = dom.window;
  document.querySelectorAll(BLOCKED_SELECTOR).forEach((node) => node.remove());

  const root = document.body;
  const blocks = [];
  collectBlocksFromNode(root, blocks);
  return blocks;
}

function collectBlocksFromNode(node, blocks) {
  if (!node || node.nodeType !== 1) return;
  const element = node;
  const tagName = element.tagName?.toUpperCase();

  if (!tagName) return;

  if (BLOCK_TAGS.has(tagName)) {
    const block = elementToBlock(element);
    if (block) blocks.push(block);
    return;
  }

  if (!CONTAINER_TAGS.has(tagName) && tagName !== "BODY") {
    Array.from(element.children).forEach((child) => collectBlocksFromNode(child, blocks));
    return;
  }

  Array.from(element.children).forEach((child) => collectBlocksFromNode(child, blocks));
}

function elementToBlock(element) {
  const tagName = element.tagName.toUpperCase();

  if (tagName === "UL" || tagName === "OL") {
    const items = Array.from(element.querySelectorAll(":scope > li"))
      .map((item) => sanitizeInlineText(item.textContent || ""))
      .filter(Boolean);

    return items.length ? { type: "list", items } : null;
  }

  const text = sanitizeInlineText(element.textContent || "");
  if (!text || text.length < 20) return null;

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

function textToParagraphBlocks(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((chunk) => sanitizeInlineText(chunk))
    .filter((chunk) => chunk.length >= 20)
    .map((chunk) => ({ type: "paragraph", text: chunk }));
}

function buildSections({ title, blocks }) {
  const sections = [];
  let current = createSection(title || "Overview", 1);

  for (const block of blocks) {
    const currentWords = countWords(buildSectionPlainText(current.blocks));
    const shouldSplitForHeading =
      block.type === "heading" &&
      current.blocks.length > 0 &&
      ((block.level || 2) <= 2 || currentWords > 240);
    const shouldSplitForLength =
      currentWords > 340 &&
      (block.type === "paragraph" || block.type === "quote");

    if (shouldSplitForHeading || shouldSplitForLength) {
      finalizeSection(current, sections);
      current = createSection(block.type === "heading" ? block.text : nextSectionTitle(title, sections.length + 1), sections.length + 1);

      if (block.type === "heading") {
        current.blocks.push(block);
        continue;
      }
    }

    if (!current.title && block.type === "heading") {
      current.title = block.text;
    }

    current.blocks.push(block);
  }

  finalizeSection(current, sections);

  return sections.length ? sections : [createFallbackSection(title, blocks)];
}

function createSection(title, order) {
  return {
    id: `section-${order}`,
    title: title || `Section ${order}`,
    blocks: [],
  };
}

function createFallbackSection(title, blocks) {
  const section = createSection(title || "Overview", 1);
  section.blocks = blocks;
  return decorateSection(section);
}

function finalizeSection(section, sections) {
  if (!section.blocks.length) return;
  sections.push(decorateSection(section));
}

function decorateSection(section) {
  const plainText = buildSectionPlainText(section.blocks);
  const wordCount = countWords(plainText);
  return {
    id: section.id,
    title: section.title || "Section",
    blocks: section.blocks,
    plainText,
    wordCount,
    estimatedReadingTime: estimateReadingTime(wordCount),
  };
}

function buildSectionPlainText(blocks) {
  return blocks
    .map((block) => {
      if (block.type === "list") {
        return block.items.join("\n");
      }
      return block.text;
    })
    .filter(Boolean)
    .join("\n\n");
}

function buildPlainText(blocks, fallbackText) {
  const text = buildSectionPlainText(blocks);
  return text || fallbackText || "";
}

function buildPreviewText(plainText) {
  const preview = String(plainText || "")
    .replace(/\s+/g, " ")
    .trim();
  return preview.length > 220 ? `${preview.slice(0, 217).trim()}...` : preview;
}

function countWords(text) {
  const matches = String(text || "").trim().match(/\b[\p{L}\p{N}'’-]+\b/gu);
  return matches ? matches.length : 0;
}

function estimateReadingTime(wordCount) {
  return Math.max(1, Math.ceil(wordCount / 220));
}

function canonicalizeUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(value);
    url.hash = "";

    const removableParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];
    removableParams.forEach((key) => url.searchParams.delete(key));
    const sorted = Array.from(url.searchParams.entries()).sort(([left], [right]) => left.localeCompare(right));
    url.search = "";
    for (const [key, paramValue] of sorted) {
      url.searchParams.append(key, paramValue);
    }

    return url.toString();
  } catch {
    return "";
  }
}

function inferSourceName(urlValue) {
  if (!urlValue) return "Imported webpage";
  try {
    const host = new URL(urlValue).hostname.replace(/^www\./, "");
    const parts = host.split(".");
    if (parts.length === 0) return host;
    const primary = parts.length > 2 ? parts[parts.length - 2] : parts[0];
    return primary
      .split(/[-_]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return "Imported webpage";
  }
}

function inferTitleFromUrl(urlValue) {
  if (!urlValue) return "Untitled import";
  try {
    const url = new URL(urlValue);
    const pathPart = url.pathname.split("/").filter(Boolean).at(-1) || url.hostname.replace(/^www\./, "");
    return pathPart
      .replace(/\.[a-z0-9]+$/i, "")
      .split(/[-_]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return "Untitled import";
  }
}

function nextSectionTitle(title, index) {
  if (index <= 1 && title) return title;
  return `Section ${index}`;
}

function compareImportedTexts(left, right, sort) {
  if (sort === "oldest") {
    return new Date(left.importedAt).getTime() - new Date(right.importedAt).getTime();
  }
  if (sort === "longest") {
    return right.wordCount - left.wordCount || new Date(right.importedAt).getTime() - new Date(left.importedAt).getTime();
  }
  if (sort === "shortest") {
    return left.wordCount - right.wordCount || new Date(right.importedAt).getTime() - new Date(left.importedAt).getTime();
  }
  return new Date(right.importedAt).getTime() - new Date(left.importedAt).getTime();
}

function summarizeImportedText(item) {
  return {
    id: item.id,
    title: item.title,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    author: item.author,
    publishedAt: item.publishedAt,
    importedAt: item.importedAt,
    updatedAt: item.updatedAt,
    wordCount: item.wordCount,
    estimatedReadingTime: item.estimatedReadingTime,
    sectionCount: item.sectionCount,
    pageCount: item.pageCount,
    progress: item.progress,
    favIconUrl: item.favIconUrl,
    thumbnailUrl: item.thumbnailUrl,
    status: item.status,
    previewText: item.previewText,
    failureReason: item.failureReason,
    origin: item.origin,
  };
}

function createInitialProgress() {
  return {
    percent: 0,
    completedSectionIds: [],
    currentSectionId: "",
    lastOpenedAt: "",
  };
}

function normalizeProgressUpdate(currentProgress, sectionCount, body) {
  const base = currentProgress && typeof currentProgress === "object" ? currentProgress : createInitialProgress();
  const completedSectionIds = Array.isArray(body?.completedSectionIds)
    ? body.completedSectionIds.map((value) => normalizeText(value)).filter(Boolean)
    : Array.isArray(base.completedSectionIds)
      ? base.completedSectionIds.filter(Boolean)
      : [];
  const currentSectionId = normalizeText(body?.currentSectionId) || normalizeText(base.currentSectionId);
  const incomingPercent = Number(body?.percent);
  const percentFromBody = Number.isFinite(incomingPercent) ? Math.min(100, Math.max(0, incomingPercent)) : null;
  const derivedPercent = sectionCount > 0 ? Math.round((completedSectionIds.length / sectionCount) * 100) : 0;

  return {
    percent: percentFromBody ?? Math.max(base.percent || 0, derivedPercent),
    completedSectionIds,
    currentSectionId,
    lastOpenedAt: body?.touch ? new Date().toISOString() : normalizeIsoDate(body?.lastOpenedAt) || base.lastOpenedAt || "",
  };
}

function paragraphsToHtml(content) {
  return String(content || "")
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
    .join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
