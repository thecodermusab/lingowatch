import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd, env } from "node:process";

const PORT = Number(env.PORT || 3001);
const HOST = env.HOST || "127.0.0.1";
const ROOT_DIR = cwd();
const ENV_FILES = [join(ROOT_DIR, ".env"), join(ROOT_DIR, ".env.local")];

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

const defaultExamples = [
  { type: "simple", text: "Here is a simple example sentence." },
  { type: "daily", text: "Here is a daily life example." },
  { type: "work", text: "Here is a work example." },
];

createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/ai/explain") {
    try {
      const body = await readJsonBody(req);
      const phraseText = String(body?.phraseText || "").trim();

      if (!phraseText) {
        sendJson(res, 400, { error: "phraseText is required" });
        return;
      }

      const aiResult = await explainPhrase(phraseText);
      sendJson(res, 200, aiResult);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected server error";
      sendJson(res, 500, { error: message });
      return;
    }
  }

  if (req.method === "POST" && req.url === "/api/ai/random-phrases") {
    try {
      const body = await readJsonBody(req);
      const count = Math.min(Math.max(Number(body?.count || 20), 1), 50);
      const excludePhrases = Array.isArray(body?.excludePhrases)
        ? body.excludePhrases.map((item) => String(item || "").trim()).filter(Boolean)
        : [];

      const phrases = await generateRandomPhrases({
        count,
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

  if (req.method === "GET" && req.url === "/api/ai/health") {
    sendJson(res, 200, getAiHealth());
    return;
  }

  if (req.method === "POST" && req.url === "/api/ai/test") {
    try {
      const health = getAiHealth();

      if (!health.configured) {
        sendJson(res, 400, { error: `AI is not configured for provider: ${health.provider}` });
        return;
      }

      await explainPhrase("break the ice");
      sendJson(res, 200, {
        ok: true,
        provider: health.provider,
        model: health.model,
        message: "Backend and AI provider are working.",
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI test failed";
      sendJson(res, 500, { error: message });
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

async function explainPhrase(phraseText) {
  const result = await requestJsonFromProviders({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Phrase: ${phraseText}`,
  });

  return normalizeAiResult(result);
}

async function generateRandomPhrases({ count, difficulty, phraseType, category, excludePhrases }) {
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
    systemPrompt: RANDOM_PHRASES_SYSTEM_PROMPT,
    userPrompt: `Return ${count} useful phrase entries. ${filterText} ${excludeText}`,
  });

  return normalizePhraseEntries(result);
}

function getAiHealth() {
  const provider = String(env.AI_PROVIDER || "").trim().toLowerCase();

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

  return {
    provider: provider || "unset",
    model: "unset",
    configured: false,
  };
}

function getProviderChain() {
  const preferred = String(env.AI_PROVIDER || "gemini").trim().toLowerCase();
  const configuredProviders = [];

  const orderedProviders = [preferred, "gemini", "grok", "openrouter"];

  for (const provider of orderedProviders) {
    if (!["gemini", "grok", "openrouter"].includes(provider)) continue;
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
    }
  }

  if (configuredProviders.length === 0) {
    throw new Error("No AI provider is configured. Add GEMINI_API_KEY, XAI_API_KEY, or OPENROUTER_API_KEY to .env.local");
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

async function requestJsonFromProviders({ systemPrompt, userPrompt }) {
  const providers = getProviderChain();
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider error";
      errors.push(`${provider}: ${message}`);
    }
  }

  throw new Error(`All AI providers failed. ${errors.join(" | ")}`);
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

function normalizeCategory(value) {
  const valid = new Set(["Daily Life", "Work", "Social", "Learning", "Travel", "Technology", "Health", "Business", "Emotions", "Other"]);
  return valid.has(value) ? value : "Other";
}

function normalizeDifficulty(value) {
  const valid = new Set(["beginner", "intermediate", "advanced"]);
  return valid.has(value) ? value : "intermediate";
}
