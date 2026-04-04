import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cwd, env } from "node:process";
import * as YoutubeTranscriptModule from "youtube-transcript/dist/youtube-transcript.esm.js";

const PORT = Number(env.PORT || 3001);
const HOST = env.HOST || "127.0.0.1";
const ROOT_DIR = cwd();
const ENV_FILES = [join(ROOT_DIR, ".env"), join(ROOT_DIR, ".env.local")];
const DATA_DIR = join(ROOT_DIR, "server", "data");
const INBOX_FILE = join(DATA_DIR, "inbox-captures.json");

loadEnvFile();

const SYSTEM_PROMPT = `
You are an English phrase learning assistant.
Return only valid JSON.

You must return one JSON object with this exact shape:
{
  "phraseType": "word | phrase | phrasal_verb | idiom | expression",
  "standardMeaning": "string",
  "easyMeaning": "string",
  "aiExplanation": "string",
  "usageContext": "string",
  "examples": [
    { "type": "simple | daily | work | extra | somali", "text": "string" }
  ],
  "somaliMeaning": "string",
  "somaliExplanation": "string",
  "somaliSentence": "string",
  "commonMistake": "string",
  "pronunciationText": "string",
  "relatedPhrases": ["string", "string", "string"]
}

Rules:
- Use simple English.
- Keep Somali fields helpful and natural.
- examples must have 3 to 5 items.
- relatedPhrases must have 3 items.
- Do not include markdown.
- Do not include code fences.
`.trim();

const RANDOM_PHRASES_SYSTEM_PROMPT = `
You create useful English learning phrases for ESL learners.
Return only valid JSON.

Return a JSON array.
Each item must match this exact shape:
{
  "phraseText": "string",
  "phraseType": "word | phrase | phrasal_verb | idiom | expression",
  "category": "Daily Life | Work | Social | Learning | Travel | Technology | Health | Business | Emotions | Other",
  "difficultyLevel": "beginner | intermediate | advanced"
}

Rules:
- Return only English entries.
- Avoid duplicates.
- Avoid very rare, strange, or broken phrases.
- Make the list varied and useful.
- Do not include markdown.
- Do not include code fences.
`.trim();

const EXTENSION_WORD_INSIGHTS_SYSTEM_PROMPT = `
You are a bilingual English-to-Somali vocabulary coach for language learners.
Return only valid JSON.

You must return one JSON object with this exact shape:
{
  "contextExplanation": "string",
  "somalTranslation": "string",
  "easyMeaning": "string",
  "usageContext": "string",
  "commonMistake": "string",
  "relatedPhrases": ["string", "string", "string"],
  "alternatives": ["string", "string", "string"],
  "synonyms": ["string", "string", "string"],
  "synonymsSomali": ["string", "string", "string"],
  "antonyms": ["string", "string", "string"],
  "exampleSentence": "string",
  "examples": ["string", "string", "string", "string", "string", "string", "string", "string", "string", "string"],
  "partOfSpeechHints": [
    { "partOfSpeech": "verb", "somali": ["string", "string", "string"] }
  ]
}

Rules:
- contextExplanation should be 2-3 short learner-friendly sentences.
- somalTranslation should be the clearest Somali translation for the word in context.
- easyMeaning should be a very short simple English meaning.
- usageContext should explain when people commonly use the word.
- commonMistake should describe a common learner mistake.
- relatedPhrases should have 3 to 5 short related phrases.
- alternatives should be Somali alternatives for the same meaning.
- examples should have 8 to 10 short and practical learner-friendly sentences.
- partOfSpeechHints should cover the most relevant parts of speech in Somali.
- Do not include markdown.
- Do not include code fences.
`.trim();

const EXTENSION_WORD_AI_EXPLANATION_SYSTEM_PROMPT = `
You are a bilingual English-to-Somali vocabulary coach for language learners.
Return only valid JSON.

You must return one JSON object with this exact shape:
{
  "aiExplanation": "string"
}

Rules:
- aiExplanation should be 2 short Somali paragraphs.
- Explain the nuance of the word in the subtitle context.
- Point out what the learner should notice.
- Do not include markdown.
- Do not include code fences.
`.trim();

const defaultExamples = [
  { type: "simple", text: "Here is a simple example sentence." },
  { type: "daily", text: "Here is a daily life example." },
  { type: "work", text: "Here is a work example." },
];

createServer(async (req, res) => {
  setCorsHeaders(res);
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && pathname === "/api/ai/explain") {
    try {
      const body = await readJsonBody(req);
      const phraseText = String(body?.phraseText || "").trim();
      const preferredProvider = normalizePreferredProvider(body?.preferredProvider);

      if (!phraseText) {
        sendJson(res, 400, { error: "phraseText is required" });
        return;
      }

      const aiResult = await explainPhrase(phraseText, preferredProvider);
      sendJson(res, 200, aiResult);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected server error";
      sendJson(res, 500, { error: message });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/ai/random-phrases") {
    try {
      const body = await readJsonBody(req);
      const count = Math.min(Math.max(Number(body?.count || 20), 1), 50);
      const preferredProvider = normalizePreferredProvider(body?.preferredProvider);
      const excludePhrases = Array.isArray(body?.excludePhrases)
        ? body.excludePhrases.map((item) => String(item || "").trim()).filter(Boolean)
        : [];

      const phrases = await generateRandomPhrases({
        count,
        preferredProvider,
        difficulty: String(body?.difficulty || "all"),
        phraseType: String(body?.phraseType || "all"),
        category: String(body?.category || "all"),
        excludePhrases,
      });

      sendJson(res, 200, phrases);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate random phrases";
      sendJson(res, 500, { error: message });
      return;
    }
  }

  if (req.method === "GET" && pathname === "/api/ai/health") {
    const preferredProvider = normalizePreferredProvider(url.searchParams.get("preferredProvider"));
    sendJson(res, 200, getAiHealth(preferredProvider));
    return;
  }

  if (req.method === "GET" && pathname === "/api/ai/providers/status") {
    try {
      const statuses = await Promise.all(
        ["gemini", "grok", "openrouter", "cerebras", "antigravity"].map((provider) => testSingleProvider(provider))
      );
      sendJson(res, 200, statuses);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not test AI providers";
      sendJson(res, 500, { error: message });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/ai/test") {
    try {
      const body = await readJsonBody(req);
      const preferredProvider = normalizePreferredProvider(body?.preferredProvider);
      const health = getAiHealth(preferredProvider);

      if (!health.configured) {
        sendJson(res, 400, { error: `AI is not configured for provider: ${health.provider}` });
        return;
      }

      await explainPhrase("break the ice", preferredProvider);
      sendJson(res, 200, {
        ok: true,
        provider: getAiHealth(preferredProvider).provider,
        model: getAiHealth(preferredProvider).model,
        message: "Backend and AI provider are working.",
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI test failed";
      sendJson(res, 500, { error: message });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/extension/word-insights") {
    try {
      const body = await readJsonBody(req);
      const word = String(body?.word || "").trim().toLowerCase();
      const sentenceContext = String(body?.sentenceContext || "").trim();
      const preferredProvider = normalizePreferredProvider(body?.preferredProvider);

      if (!word) {
        sendJson(res, 400, { error: "word is required" });
        return;
      }

      const insights = await getExtensionWordInsights({
        word,
        sentenceContext,
        preferredProvider,
      });
      sendJson(res, 200, insights);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not fetch extension word insights";
      if (message.includes("No AI provider is configured")) {
        sendJson(res, 200, { aiData: null, aiExamples: [] });
        return;
      }

      sendJson(res, 502, { error: message });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/extension/word-ai-explanation") {
    try {
      const body = await readJsonBody(req);
      const word = String(body?.word || "").trim().toLowerCase();
      const sentenceContext = String(body?.sentenceContext || "").trim();
      const preferredProvider = normalizePreferredProvider(body?.preferredProvider);

      if (!word) {
        sendJson(res, 400, { error: "word is required" });
        return;
      }

      const explanation = await getExtensionWordAiExplanation({
        word,
        sentenceContext,
        preferredProvider,
      });
      sendJson(res, 200, explanation);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not fetch extension word explanation";
      if (message.includes("No AI provider is configured")) {
        sendJson(res, 200, { aiExplanation: "" });
        return;
      }

      sendJson(res, 502, { error: message });
      return;
    }
  }

  if (req.method === "GET" && pathname.startsWith("/api/transcript/")) {
    try {
      const videoId = decodeURIComponent(pathname.slice("/api/transcript/".length));

      if (!videoId) {
        sendJson(res, 400, { detail: "video id is required" });
        return;
      }

      const transcript = await fetchYoutubeTranscript(videoId);
      const entries = transcript
        .map((item, index) => {
          const rawOffset = Number(item?.offset) || 0;
          const rawDuration = Number(item?.duration) || 0;
          const usesMilliseconds = rawDuration > 100;

          return {
            index,
            text: String(item?.text || "").replace(/\n/g, " ").trim(),
            start: Math.round((usesMilliseconds ? rawOffset / 1000 : rawOffset) * 100) / 100,
            duration: Math.round((usesMilliseconds ? rawDuration / 1000 : rawDuration) * 100) / 100,
          };
        })
        .filter((item) => item.text);

      if (!entries.length) {
        sendJson(res, 404, { detail: "Transcript not found" });
        return;
      }

      sendJson(res, 200, { transcript: entries });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch transcript";
      sendJson(res, 502, { detail: message || "Failed to fetch transcript" });
      return;
    }
  }

  if (req.method === "GET" && pathname === "/api/inbox/captures") {
    sendJson(res, 200, loadInboxCaptures());
    return;
  }

  if (req.method === "POST" && pathname === "/api/inbox/captures") {
    try {
      const body = await readJsonBody(req);
      const capture = createInboxCapture(body);
      const captures = loadInboxCaptures();
      const existingIndex = captures.findIndex((item) => item.key === capture.key);

      if (existingIndex >= 0) {
        captures[existingIndex] = {
          ...captures[existingIndex],
          ...capture,
          id: captures[existingIndex].id,
          createdAt: captures[existingIndex].createdAt,
          updatedAt: new Date().toISOString(),
        };
      } else {
        captures.unshift(capture);
      }

      saveInboxCaptures(captures);
      sendJson(res, 200, existingIndex >= 0 ? captures[existingIndex] : capture);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save capture";
      sendJson(res, 400, { error: message });
      return;
    }
  }

  if (req.method === "PATCH" && pathname.startsWith("/api/inbox/captures/")) {
    try {
      const captureId = decodeURIComponent(pathname.slice("/api/inbox/captures/".length));
      const body = await readJsonBody(req);
      const captures = loadInboxCaptures();
      const index = captures.findIndex((item) => item.id === captureId);

      if (index === -1) {
        sendJson(res, 404, { error: "Capture not found" });
        return;
      }

      captures[index] = {
        ...captures[index],
        status: normalizeCaptureStatus(body?.status) ?? captures[index].status,
        importedPhraseId: typeof body?.importedPhraseId === "string" ? body.importedPhraseId : captures[index].importedPhraseId,
        updatedAt: new Date().toISOString(),
      };

      saveInboxCaptures(captures);
      sendJson(res, 200, captures[index]);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update capture";
      sendJson(res, 400, { error: message });
      return;
    }
  }

  sendJson(res, 404, { error: "Not found" });
}).listen(PORT, HOST, () => {
  console.log(`AI backend running on http://${HOST}:${PORT}`);
});

function loadEnvFile() {
  for (const envFile of ENV_FILES) {
    if (!existsSync(envFile)) continue;

    const content = readFileSync(envFile, "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const equalIndex = line.indexOf("=");
      if (equalIndex === -1) continue;

      const key = line.slice(0, equalIndex).trim();
      let value = line.slice(equalIndex + 1).trim();

      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      env[key] = value;
    }
  }
}

async function fetchYoutubeTranscript(videoId) {
  if (typeof YoutubeTranscriptModule.fetchTranscript === "function") {
    return YoutubeTranscriptModule.fetchTranscript(videoId);
  }

  if (typeof YoutubeTranscriptModule.YoutubeTranscript?.fetchTranscript === "function") {
    return YoutubeTranscriptModule.YoutubeTranscript.fetchTranscript(videoId);
  }

  throw new Error("youtube-transcript export is unavailable");
}

function ensureInboxFile() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!existsSync(INBOX_FILE)) {
    writeFileSync(INBOX_FILE, "[]\n", "utf8");
  }
}

function loadInboxCaptures() {
  ensureInboxFile();
  try {
    const raw = readFileSync(INBOX_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveInboxCaptures(captures) {
  ensureInboxFile();
  writeFileSync(INBOX_FILE, `${JSON.stringify(captures, null, 2)}\n`, "utf8");
}

function createInboxCapture(input) {
  const word = String(input?.word || input?.phraseText || "").trim().toLowerCase();
  const displayWord = String(input?.displayWord || input?.word || input?.phraseText || "").trim();

  if (!word || !displayWord) {
    throw new Error("word is required");
  }

  const sourceUrl = String(input?.sourceUrl || "").trim();
  const sourceHost = String(input?.sourceHost || input?.source || "").trim();
  const sentenceContext = String(input?.sentenceContext || input?.context || "").trim();
  const timestampSeconds = Number.isFinite(Number(input?.timestampSeconds)) ? Number(input.timestampSeconds) : null;
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    key: [word, sourceUrl || sourceHost || "manual", timestampSeconds ?? "", sentenceContext].join("::"),
    word,
    displayWord,
    translation: String(input?.translation || "").trim(),
    note: String(input?.note || "").trim(),
    sentenceContext,
    sourceHost,
    sourceTitle: String(input?.sourceTitle || "").trim(),
    sourceUrl,
    timestampSeconds,
    sourceType: String(input?.sourceType || "extension").trim(),
    status: "new",
    importedPhraseId: "",
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeCaptureStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return ["new", "imported", "archived"].includes(status) ? status : undefined;
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
    });

    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

async function explainPhrase(phraseText, preferredProvider) {
  const result = await requestJsonFromProviders({
    preferredProvider,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Phrase: ${phraseText}`,
  });

  return normalizeAiResult(result);
}

async function generateRandomPhrases({ count, preferredProvider, difficulty, phraseType, category, excludePhrases }) {
  const filterParts = [];

  if (difficulty && difficulty !== "all") {
    filterParts.push(`difficulty ${difficulty}`);
  }

  if (phraseType && phraseType !== "all") {
    filterParts.push(`type ${phraseType}`);
  }

  if (category && category !== "all") {
    filterParts.push(`category ${category}`);
  }

  const filterText = filterParts.length > 0 ? `Filters: ${filterParts.join(", ")}.` : "No filter restrictions.";
  const excludeText = excludePhrases.length > 0
    ? `Do not include any of these phrases: ${excludePhrases.slice(0, 200).join(", ")}.`
    : "";

  const result = await requestJsonFromProviders({
    preferredProvider,
    systemPrompt: RANDOM_PHRASES_SYSTEM_PROMPT,
    userPrompt: `Return ${count} useful phrase entries. ${filterText} ${excludeText}`,
  });

  return normalizePhraseEntries(result);
}

async function getExtensionWordInsights({ word, sentenceContext, preferredProvider }) {
  const result = await requestJsonFromProviders({
    preferredProvider,
    systemPrompt: EXTENSION_WORD_INSIGHTS_SYSTEM_PROMPT,
    userPrompt: `Word: ${word}\nSubtitle context: ${sentenceContext || "(none)"}`,
  });

  return normalizeExtensionWordInsights(result, { word, sentenceContext });
}

async function getExtensionWordAiExplanation({ word, sentenceContext, preferredProvider }) {
  const result = await requestJsonFromProviders({
    preferredProvider,
    systemPrompt: EXTENSION_WORD_AI_EXPLANATION_SYSTEM_PROMPT,
    userPrompt: `Word: ${word}\nSubtitle context: ${sentenceContext || "(none)"}`,
  });

  return {
    aiExplanation: stringOrFallback(result?.aiExplanation, ""),
  };
}

function normalizePreferredProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  return ["gemini", "grok", "openrouter", "cerebras", "antigravity"].includes(provider) ? provider : undefined;
}

async function testSingleProvider(provider) {
  const normalizedProvider = normalizePreferredProvider(provider);
  const health = getAiHealth(normalizedProvider);

  if (!normalizedProvider) {
    return {
      provider: String(provider || "unknown"),
      model: "unset",
      configured: false,
      ok: false,
      message: "Unknown provider",
    };
  }

  if (!health.configured) {
    return {
      provider: normalizedProvider,
      model: health.model,
      configured: false,
      ok: false,
      message: `${getProviderLabel(normalizedProvider)} is not configured`,
    };
  }

  try {
    await requestJsonFromSingleProvider({
      provider: normalizedProvider,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: "Phrase: break the ice",
    });

    return {
      provider: normalizedProvider,
      model: health.model,
      configured: true,
      ok: true,
      message: `${getProviderLabel(normalizedProvider)} is working`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown provider error";
    return {
      provider: normalizedProvider,
      model: health.model,
      configured: true,
      ok: false,
      message: summarizeProviderError(normalizedProvider, message),
    };
  }
}

function getAiHealth(preferredProvider) {
  const provider = normalizePreferredProvider(preferredProvider) || String(env.AI_PROVIDER || "").trim().toLowerCase();

  if (provider === "gemini") {
    return {
      provider,
      model: env.GEMINI_MODEL || "gemini-2.5-flash",
      configured: Boolean(env.GEMINI_API_KEY),
    };
  }

  if (provider === "grok") {
    return {
        provider,
        model: env.XAI_MODEL || "grok-4-fast-reasoning",
        configured: Boolean(env.XAI_API_KEY),
      };
    }

  if (provider === "openrouter") {
    return {
      provider,
      model: env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
      configured: Boolean(env.OPENROUTER_API_KEY),
    };
  }

  if (provider === "cerebras") {
    return {
      provider,
      model: env.CEREBRAS_MODEL || "gpt-oss-120b",
      configured: Boolean(env.CEREBRAS_API_KEY),
    };
  }

  if (provider === "antigravity") {
    return {
      provider,
      model: env.ANTIGRAVITY_MODEL || "gemini-3-flash",
      configured: Boolean(env.ANTIGRAVITY_API_KEY && env.ANTIGRAVITY_BASE_URL),
    };
  }

  return {
    provider: provider || "unset",
    model: "unset",
    configured: false,
  };
}

function getProviderChain(preferredProvider) {
  const preferred = normalizePreferredProvider(preferredProvider) || String(env.AI_PROVIDER || "gemini").trim().toLowerCase();
  const configuredProviders = [];

  const orderedProviders = [preferred, "antigravity", "gemini", "grok", "openrouter", "cerebras"];

  for (const provider of orderedProviders) {
    if (!["gemini", "grok", "openrouter", "cerebras", "antigravity"].includes(provider)) continue;
    if (configuredProviders.includes(provider)) continue;

    if (provider === "gemini" && env.GEMINI_API_KEY) {
      configuredProviders.push(provider);
      continue;
    }

    if (provider === "grok" && env.XAI_API_KEY) {
      configuredProviders.push(provider);
      continue;
    }

    if (provider === "openrouter" && env.OPENROUTER_API_KEY) {
      configuredProviders.push(provider);
      continue;
    }

    if (provider === "cerebras" && env.CEREBRAS_API_KEY) {
      configuredProviders.push(provider);
      continue;
    }

    if (provider === "antigravity" && env.ANTIGRAVITY_API_KEY && env.ANTIGRAVITY_BASE_URL) {
      configuredProviders.push(provider);
    }
  }

  if (configuredProviders.length === 0) {
    throw new Error("No AI provider is configured. Add ANTIGRAVITY_API_KEY, GEMINI_API_KEY, XAI_API_KEY, OPENROUTER_API_KEY, or CEREBRAS_API_KEY to .env.local");
  }

  return configuredProviders;
}

async function explainWithGemini(phraseText) {
  return explainWithGeminiPrompt(SYSTEM_PROMPT, `Phrase: ${phraseText}`);
}

async function explainWithGrok(phraseText) {
  return explainWithGrokPrompt(SYSTEM_PROMPT, `Phrase: ${phraseText}`);
}

async function explainWithOpenRouter(phraseText) {
  return explainWithOpenRouterPrompt(SYSTEM_PROMPT, `Phrase: ${phraseText}`);
}

async function requestJsonFromProviders({ preferredProvider, systemPrompt, userPrompt }) {
  const providers = getProviderChain(preferredProvider);
  const errors = [];

  for (const provider of providers) {
    try {
      if (provider === "gemini") {
        return parseModelJson(await explainWithGeminiPrompt(systemPrompt, userPrompt));
      }

      if (provider === "grok") {
        return parseModelJson(await explainWithGrokPrompt(systemPrompt, userPrompt));
      }

      if (provider === "openrouter") {
        return parseModelJson(await explainWithOpenRouterPrompt(systemPrompt, userPrompt));
      }

      if (provider === "cerebras") {
        return parseModelJson(await explainWithCerebrasPrompt(systemPrompt, userPrompt));
      }

      if (provider === "antigravity") {
        return parseModelJson(await explainWithAntigravityPrompt(systemPrompt, userPrompt));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider error";
      errors.push({ provider, message: summarizeProviderError(provider, message) });
    }
  }

  throw new Error(summarizeCombinedProviderErrors(errors));
}

async function requestJsonFromSingleProvider({ provider, systemPrompt, userPrompt }) {
  if (provider === "gemini") {
    return parseModelJson(await explainWithGeminiPrompt(systemPrompt, userPrompt));
  }

  if (provider === "grok") {
    return parseModelJson(await explainWithGrokPrompt(systemPrompt, userPrompt));
  }

  if (provider === "openrouter") {
    return parseModelJson(await explainWithOpenRouterPrompt(systemPrompt, userPrompt));
  }

  if (provider === "cerebras") {
    return parseModelJson(await explainWithCerebrasPrompt(systemPrompt, userPrompt));
  }

  if (provider === "antigravity") {
    return parseModelJson(await explainWithAntigravityPrompt(systemPrompt, userPrompt));
  }

  throw new Error("Unknown provider");
}

function getProviderLabel(provider) {
  return provider === "gemini"
    ? "Gemini"
    : provider === "grok"
      ? "Grok"
      : provider === "openrouter"
        ? "OpenRouter"
        : provider === "cerebras"
          ? "Cerebras"
          : provider === "antigravity"
            ? "Antigravity"
        : String(provider || "Unknown");
}

function summarizeProviderError(provider, message) {
  const lower = String(message || "").toLowerCase();
  const providerLabel = getProviderLabel(provider);

  if (
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("rate-limit") ||
    lower.includes('"code":429') ||
    lower.includes("429")
  ) {
    return `${providerLabel} quota reached`;
  }

  if (
    lower.includes("unauthorized") ||
    lower.includes("invalid api key") ||
    lower.includes("missing") ||
    lower.includes("forbidden") ||
    lower.includes("permission")
  ) {
    return `${providerLabel} is not configured correctly`;
  }

  if (
    lower.includes("empty response") ||
    lower.includes("unexpected token") ||
    lower.includes("json")
  ) {
    return `${providerLabel} returned an invalid response`;
  }

  return `${providerLabel} is unavailable right now`;
}

function summarizeCombinedProviderErrors(errors) {
  const quotaProviders = errors.filter((item) => item.message.includes("quota reached")).map((item) => item.provider);
  const configProviders = errors.filter((item) => item.message.includes("not configured correctly")).map((item) => item.provider);

  if (errors.length === 1) {
    return errors[0].message;
  }

  if (quotaProviders.length === errors.length) {
    return "All AI providers are rate-limited right now. Try again later.";
  }

  if (quotaProviders.length > 0 && quotaProviders.length < errors.length) {
    return "Some AI providers are rate-limited and the fallback providers are unavailable right now. Try again later.";
  }

  if (configProviders.length === errors.length) {
    return "AI providers are not configured correctly. Check your API keys in the env file.";
  }

  return "All AI providers are unavailable right now. Try again later.";
}

async function explainWithGeminiPrompt(systemPrompt, userPrompt) {
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in .env.local");
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed: ${errorText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  return text;
}

async function explainWithGrokPrompt(systemPrompt, userPrompt) {
  const apiKey = env.XAI_API_KEY;
  const model = env.XAI_MODEL || "grok-4-fast-reasoning";

  if (!apiKey) {
    throw new Error("Missing XAI_API_KEY in .env.local");
  }

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Grok request failed: ${errorText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("Grok returned an empty response");
  }

  return text;
}

async function explainWithOpenRouterPrompt(systemPrompt, userPrompt) {
  const apiKey = env.OPENROUTER_API_KEY;
  const model = env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY in .env.local");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter request failed: ${errorText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("OpenRouter returned an empty response");
  }

  return text;
}

async function explainWithCerebrasPrompt(systemPrompt, userPrompt) {
  const apiKey = env.CEREBRAS_API_KEY;
  const model = env.CEREBRAS_MODEL || "gpt-oss-120b";

  if (!apiKey) {
    throw new Error("Missing CEREBRAS_API_KEY in .env.local");
  }

  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_completion_tokens: 1200,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cerebras request failed: ${errorText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("Cerebras returned an empty response");
  }

  return text;
}

async function explainWithAntigravityPrompt(systemPrompt, userPrompt) {
  const apiKey = env.ANTIGRAVITY_API_KEY;
  const model = env.ANTIGRAVITY_MODEL || "gemini-3-flash";
  const baseUrl = String(env.ANTIGRAVITY_BASE_URL || "http://127.0.0.1:8045/v1").replace(/\/$/, "");

  if (!apiKey) {
    throw new Error("Missing ANTIGRAVITY_API_KEY in .env.local");
  }

  if (!baseUrl) {
    throw new Error("Missing ANTIGRAVITY_BASE_URL in .env.local");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Antigravity request failed: ${errorText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("Antigravity returned an empty response");
  }

  return text;
}

function parseModelJson(text) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  return JSON.parse(cleaned);
}

function normalizeAiResult(result) {
  const phraseType = normalizePhraseType(result?.phraseType);
  const examples = Array.isArray(result?.examples) && result.examples.length > 0
    ? result.examples.slice(0, 5).map((example) => ({
        type: normalizeExampleType(example?.type),
        text: String(example?.text || "").trim() || "Example unavailable.",
      }))
    : defaultExamples;

  const relatedPhrases = Array.isArray(result?.relatedPhrases)
    ? result.relatedPhrases
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return {
    phraseType,
    standardMeaning: stringOrFallback(result?.standardMeaning, "Meaning unavailable."),
    easyMeaning: stringOrFallback(result?.easyMeaning, "Simple meaning unavailable."),
    aiExplanation: stringOrFallback(result?.aiExplanation, "Explanation unavailable."),
    usageContext: stringOrFallback(result?.usageContext, "Usage context unavailable."),
    examples,
    somaliMeaning: stringOrFallback(result?.somaliMeaning, "Macne lama helin."),
    somaliExplanation: stringOrFallback(result?.somaliExplanation, "Sharaxaad lama helin."),
    somaliSentence: stringOrFallback(result?.somaliSentence, "Tusaale lama helin."),
    commonMistake: stringOrFallback(result?.commonMistake, "No common mistake provided."),
    pronunciationText: stringOrFallback(result?.pronunciationText, "/unknown/"),
    relatedPhrases: relatedPhrases.length > 0 ? relatedPhrases : ["related phrase 1", "related phrase 2", "related phrase 3"],
  };
}

function stringOrFallback(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizePhraseType(value) {
  const valid = new Set(["word", "phrase", "phrasal_verb", "idiom", "expression"]);
  return valid.has(value) ? value : "phrase";
}

function normalizeExampleType(value) {
  const valid = new Set(["simple", "daily", "work", "extra", "somali"]);
  return valid.has(value) ? value : "simple";
}

function normalizePhraseEntries(result) {
  const entries = Array.isArray(result) ? result : [];

  return entries
    .map((entry) => ({
      phraseText: stringOrFallback(entry?.phraseText, "").trim(),
      phraseType: normalizePhraseType(entry?.phraseType),
      category: normalizeCategory(entry?.category),
      difficultyLevel: normalizeDifficulty(entry?.difficultyLevel),
    }))
    .filter((entry) => entry.phraseText.length > 0);
}

function normalizeExtensionWordInsights(result, { word, sentenceContext }) {
  const aiData = {
    contextExplanation: stringOrFallback(result?.contextExplanation, ""),
    somalTranslation: stringOrFallback(result?.somalTranslation, ""),
    easyMeaning: stringOrFallback(result?.easyMeaning, ""),
    usageContext: stringOrFallback(result?.usageContext, ""),
    commonMistake: stringOrFallback(result?.commonMistake, ""),
    relatedPhrases: normalizeStringList(result?.relatedPhrases, 5),
    alternatives: normalizeStringList(result?.alternatives, 6),
    synonyms: normalizeStringList(result?.synonyms, 16, [word]),
    synonymsSomali: normalizeStringList(result?.synonymsSomali, 8),
    antonyms: normalizeStringList(result?.antonyms, 10, [word]),
    exampleSentence: stringOrFallback(result?.exampleSentence, ""),
    partOfSpeechHints: normalizePartOfSpeechHints(result?.partOfSpeechHints),
    currentLine: sentenceContext || "",
  };

  const aiExamples = normalizeStringList(result?.examples, 12);

  return {
    aiData,
    aiExamples,
  };
}

function normalizePartOfSpeechHints(value) {
  const items = Array.isArray(value) ? value : [];
  const seen = new Set();
  const normalized = [];

  for (const item of items) {
    const partOfSpeech = String(item?.partOfSpeech || "").trim().toLowerCase();
    if (!partOfSpeech || seen.has(partOfSpeech)) {
      continue;
    }

    const somali = normalizeStringList(item?.somali, 6);
    if (somali.length === 0) {
      continue;
    }

    seen.add(partOfSpeech);
    normalized.push({ partOfSpeech, somali });

    if (normalized.length >= 4) {
      break;
    }
  }

  return normalized;
}

function normalizeStringList(value, limit, excludedValues = []) {
  const items = Array.isArray(value) ? value : [];
  const exclusions = new Set(
    excludedValues
      .map((entry) => String(entry || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const seen = new Set();
  const normalized = [];

  for (const item of items) {
    const text = String(item || "").trim();
    if (!text) {
      continue;
    }

    const key = text.toLowerCase();
    if (exclusions.has(key) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(text);
    if (normalized.length >= limit) {
      break;
    }
  }

  return normalized;
}

function normalizeCategory(value) {
  const valid = new Set(["Daily Life", "Work", "Social", "Learning", "Travel", "Technology", "Health", "Business", "Emotions", "Other"]);
  return valid.has(value) ? value : "Other";
}

function normalizeDifficulty(value) {
  const valid = new Set(["beginner", "intermediate", "advanced"]);
  return valid.has(value) ? value : "intermediate";
}
