import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cwd, env } from "node:process";
import * as YoutubeTranscriptModule from "youtube-transcript/dist/youtube-transcript.esm.js";
import { neon } from "@neondatabase/serverless";
import { handlePodcastRoutes } from "./podcasts.mjs";
import { handleImportedTextRoutes } from "./importedTexts.mjs";

const PORT = Number(env.PORT || 3001);
const HOST = env.HOST || "127.0.0.1";
const ROOT_DIR = cwd();
const ENV_FILES = [join(ROOT_DIR, ".env"), join(ROOT_DIR, ".env.local")];
const DATA_DIR = join(ROOT_DIR, "server", "data");
const INBOX_FILE = join(DATA_DIR, "inbox-captures.json");
const EXT_PHRASES_FILE = join(DATA_DIR, "ext-saved-phrases.json");
const WORLD_STORIES_FILE = join(DATA_DIR, "world-stories.json");
const YOUTUBE_CHANNEL_SEEDS_FILE = join(DATA_DIR, "youtube-channel-seeds.txt");
const CHANNEL_THUMBNAILS_FILE = join(DATA_DIR, "channel-thumbnails.json");
const CHANNEL_THUMBNAIL_TTL_MS = 20 * 24 * 60 * 60 * 1000; // 20 days

loadEnvFile();

const sql = env.DATABASE_URL ? neon(env.DATABASE_URL) : null;

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

const TRANSCRIPT_TRANSLATION_SYSTEM_PROMPT = `
You translate English subtitle cues into natural Somali for language learners.
Return only valid JSON.

You must return one JSON object with this exact shape:
{
  "translations": ["string"]
}

Rules:
- Return exactly one Somali translation for each English subtitle line.
- Keep the order exactly the same as the input order.
- Do not merge, split, skip, number, or explain lines.
- Preserve names, brands, and obvious proper nouns when needed.
- Keep each translation concise enough to work as a subtitle.
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

  if (req.method === "POST" && pathname === "/api/ai/story") {
    try {
      const body = await readJsonBody(req);
      const words = Array.isArray(body?.words) ? body.words.map((w) => String(w || "").trim()).filter(Boolean) : [];
      const preferredProvider = normalizePreferredProvider(body?.preferredProvider);

      if (!words.length) {
        sendJson(res, 400, { error: "words array is required" });
        return;
      }

      const { title, content } = await generateStory(words, preferredProvider);
      sendJson(res, 200, { title, story: content });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate story";
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

  // Extension → save a word directly into the website's phrase library
  if (req.method === "GET" && pathname === "/api/extension/saved-phrases") {
    try {
      const data = existsSync(EXT_PHRASES_FILE) ? JSON.parse(readFileSync(EXT_PHRASES_FILE, "utf8")) : [];
      sendJson(res, 200, data);
    } catch { sendJson(res, 200, []); }
    return;
  }

  if (req.method === "POST" && pathname === "/api/extension/save-phrase") {
    try {
      const body = await readJsonBody(req);
      if (!body?.phraseText) { sendJson(res, 400, { error: "phraseText required" }); return; }

      const existing = existsSync(EXT_PHRASES_FILE)
        ? JSON.parse(readFileSync(EXT_PHRASES_FILE, "utf8"))
        : [];

      const now = new Date().toISOString();
      const id = body.id || crypto.randomUUID();
      const phraseText = String(body.phraseText).trim();

      // Remove existing entry for same word (case-insensitive)
      const filtered = existing.filter(p => p.phraseText?.toLowerCase() !== phraseText.toLowerCase());

      const phrase = {
        id,
        phraseText,
        phraseType: body.phraseType || "word",
        category: body.category || "YouTube",
        notes: body.notes || "",
        isFavorite: false,
        isLearned: false,
        tags: ["youtube"],
        difficultyLevel: body.difficultyLevel || "intermediate",
        createdAt: now,
        updatedAt: now,
        explanation: body.explanation || null,
        examples: body.examples || [],
        review: { id: crypto.randomUUID(), phraseId: id, reviewCount: 0, nextReviewAt: now, confidenceScore: 0 },
      };

      filtered.unshift(phrase);
      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(EXT_PHRASES_FILE, JSON.stringify(filtered, null, 2));
      sendJson(res, 200, { ok: true, phrase });
    } catch (err) {
      sendJson(res, 500, { error: String(err) });
    }
    return;
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/extension/saved-phrases/")) {
    try {
      const entryId = decodeURIComponent(pathname.slice("/api/extension/saved-phrases/".length)).trim();

      if (!entryId) {
        sendJson(res, 400, { error: "entry id is required" });
        return;
      }

      const existing = existsSync(EXT_PHRASES_FILE)
        ? JSON.parse(readFileSync(EXT_PHRASES_FILE, "utf8"))
        : [];

      const updated = existing.filter(
        (phrase) => phrase?.id !== entryId && String(phrase?.phraseText || "").trim().toLowerCase() !== entryId.toLowerCase()
      );

      if (updated.length === existing.length) {
        sendJson(res, 404, { error: "Phrase not found" });
        return;
      }

      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(EXT_PHRASES_FILE, JSON.stringify(updated, null, 2));
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 500, { error: String(err) });
    }
    return;
  }

  // ── Saved words (Neon) ──────────────────────────────────────────
  if (req.method === "GET" && pathname === "/api/words") {
    try {
      if (!sql) { sendJson(res, 200, []); return; }
      const rows = await sql`SELECT * FROM saved_words ORDER BY saved_at DESC`;
      sendJson(res, 200, rows);
    } catch (err) { sendJson(res, 500, { error: String(err) }); }
    return;
  }

  if (req.method === "POST" && pathname === "/api/words") {
    try {
      if (!sql) { sendJson(res, 503, { error: "Database not configured" }); return; }
      const body = await readJsonBody(req);
      const word = String(body?.word || "").trim().toLowerCase();
      if (!word) { sendJson(res, 400, { error: "word is required" }); return; }
      const rows = await sql`
        INSERT INTO saved_words (word, display_word, translation, note, source, is_manual, is_custom_translation)
        VALUES (${word}, ${body.displayWord || body.display_word || word}, ${body.translation || ""}, ${body.note || ""}, ${body.source || ""}, ${body.isManual || false}, ${body.isCustomTranslation || false})
        ON CONFLICT (word) DO UPDATE SET
          display_word = EXCLUDED.display_word,
          translation = EXCLUDED.translation,
          note = EXCLUDED.note,
          source = EXCLUDED.source,
          is_manual = EXCLUDED.is_manual,
          is_custom_translation = EXCLUDED.is_custom_translation,
          saved_at = NOW()
        RETURNING *
      `;
      sendJson(res, 200, rows[0]);
    } catch (err) { sendJson(res, 500, { error: String(err) }); }
    return;
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/words/")) {
    try {
      if (!sql) { sendJson(res, 503, { error: "Database not configured" }); return; }
      const word = decodeURIComponent(pathname.slice("/api/words/".length));
      await sql`DELETE FROM saved_words WHERE word = ${word}`;
      sendJson(res, 200, { ok: true });
    } catch (err) { sendJson(res, 500, { error: String(err) }); }
    return;
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
      const preferredProvider = normalizePreferredProvider(url.searchParams.get("preferredProvider"));

      if (!videoId) {
        sendJson(res, 400, { detail: "video id is required" });
        return;
      }

      const transcriptCacheKey = `yt-transcript:${videoId}`;
      let entries = ytCacheGet(transcriptCacheKey);

      if (!entries) {
        const transcript = await fetchYoutubeTranscript(videoId);
        entries = transcript
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

        if (entries.length) {
          ytCacheSet(transcriptCacheKey, entries, TRANSCRIPT_CACHE_TTL_MS);
        }
      }

      if (!entries.length) {
        sendJson(res, 404, { detail: "Transcript not found" });
        return;
      }

      const transcriptWithTranslations = getTranscriptEntriesWithCachedTranslations({
        videoId,
        entries,
      });

      void primeTranscriptTranslations({
        videoId,
        entries,
        preferredProvider,
      });

      sendJson(res, 200, {
        transcript: transcriptWithTranslations,
        translationsReady: transcriptWithTranslations.every((entry) => Boolean(entry.translation)),
      });
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

  if (req.method === "GET" && pathname === "/api/world-stories") {
    try {
      const data = existsSync(WORLD_STORIES_FILE) ? JSON.parse(readFileSync(WORLD_STORIES_FILE, "utf8")) : [];
      sendJson(res, 200, data);
    } catch { sendJson(res, 200, []); }
    return;
  }

  // ─── YouTube Media API ─────────────────────────────────────────────────────

  if (req.method === "GET" && pathname === "/api/media/youtube/channels") {
    try {
      const enriched = CURATED_CHANNEL_SEEDS.map((ch) => {
        const cached = channelThumbnailCache.get(ch.id);
        if (!cached?.thumbnail) return ch;
        return {
          ...ch,
          thumbnail: cached.thumbnail,
          name: cached.name || ch.name,
          channelId: cached.channelId || "",
        };
      });
      sendJson(res, 200, enriched);
    } catch (err) {
      sendJson(res, 500, { error: String(err.message || err) });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/api/media/youtube/channel-seed") {
    try {
      const seed = url.searchParams.get("seed") || "";
      if (!seed) {
        sendJson(res, 400, { error: "seed is required" });
        return;
      }

      const result = await resolveChannelSeedPublic(seed);
      if (!result) {
        sendJson(res, 404, { error: "Channel metadata not found" });
        return;
      }

      // Persist thumbnail to disk cache so it survives server restarts
      const seedEntry = CURATED_CHANNEL_SEEDS.find(
        (ch) => (ch.handle || ch.name).toLowerCase() === seed.toLowerCase()
      );
      if (seedEntry && result.thumbnail) {
        const thumb = result.thumbnail.startsWith("//") ? `https:${result.thumbnail}` : result.thumbnail;
        channelThumbnailCache.set(seedEntry.id, {
          thumbnail: thumb,
          name: result.name || seedEntry.name,
          channelId: result.channelId || "",
          cachedAt: new Date().toISOString(),
        });
        saveChannelThumbnailCache();
      }

      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, { error: String(err.message || err) });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/api/media/youtube/videos") {
    const ytKey = env.YOUTUBE_API_KEY;
    if (!ytKey) {
      sendJson(res, 503, { error: "YOUTUBE_API_KEY not configured in .env" });
      return;
    }
    try {
      const channelId  = url.searchParams.get("channelId") || "";
      const channelSeed = url.searchParams.get("channelSeed") || "";
      const sort       = url.searchParams.get("sort") === "viewCount" ? "viewCount" : "date";
      const pageToken  = url.searchParams.get("pageToken") || "";
      const q          = url.searchParams.get("q") || "";
      const result     = channelSeed
        ? await fetchVideosForChannelSeed(ytKey, { channelSeed, sort, pageToken })
        : await fetchYouTubeVideos(ytKey, { channelId, sort, pageToken, q });
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, { error: String(err.message || err) });
    }
    return;
  }

  if (await handlePodcastRoutes(req, res, pathname, url, sql, sendJson, readJsonBody)) {
    return;
  }

  if (await handleImportedTextRoutes(req, res, pathname, url, sendJson, readJsonBody)) {
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}).listen(PORT, HOST, () => {
  console.log(`AI backend running on http://${HOST}:${PORT}`);
  // Kick off background thumbnail refresh after server is ready
  setTimeout(() => backgroundRefreshChannelThumbnails().catch(() => {}), 3000);
});

// ─── Channel thumbnail persistent cache ──────────────────────────────────────

function loadChannelThumbnailCache() {
  try {
    if (!existsSync(CHANNEL_THUMBNAILS_FILE)) return new Map();
    const data = JSON.parse(readFileSync(CHANNEL_THUMBNAILS_FILE, "utf8"));
    return new Map(Object.entries(data));
  } catch {
    return new Map();
  }
}

function saveChannelThumbnailCache() {
  try {
    const obj = Object.fromEntries(channelThumbnailCache);
    writeFileSync(CHANNEL_THUMBNAILS_FILE, JSON.stringify(obj, null, 2), "utf8");
  } catch (err) {
    console.warn("[ChannelCache] Failed to save:", err.message);
  }
}

const channelThumbnailCache = loadChannelThumbnailCache();

async function backgroundRefreshChannelThumbnails() {
  // Only refresh missing or stale entries; limit to first 60 channels
  const candidates = (CURATED_CHANNEL_SEEDS || []).slice(0, 60).filter((ch) => {
    const cached = channelThumbnailCache.get(ch.id);
    if (!cached?.thumbnail) return true;
    const age = Date.now() - new Date(cached.cachedAt).getTime();
    return age > CHANNEL_THUMBNAIL_TTL_MS;
  });

  if (!candidates.length) return;
  console.log(`[ChannelCache] Refreshing ${candidates.length} channel thumbnails in background…`);

  const BATCH = 4;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    await Promise.all(batch.map(async (seed) => {
      try {
        const result = await resolveChannelSeedPublic(seed.handle || seed.name);
        if (result?.thumbnail) {
          channelThumbnailCache.set(seed.id, {
            thumbnail: result.thumbnail.startsWith("//") ? `https:${result.thumbnail}` : result.thumbnail,
            name: result.name || seed.name,
            channelId: result.channelId || "",
            cachedAt: new Date().toISOString(),
          });
        }
      } catch { /* ignore per-channel failures */ }
    }));
    if (i + BATCH < candidates.length) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  saveChannelThumbnailCache();
  console.log("[ChannelCache] Background refresh complete.");
}

// ─── YouTube helpers ──────────────────────────────────────────────────────────

const YT_BASE = "https://www.googleapis.com/youtube/v3";
const ytCache = new Map(); // key → { data, expiresAt }
const TRANSCRIPT_CACHE_TTL_MS = 5 * 60 * 1000;
const TRANSCRIPT_TRANSLATION_TTL_MS = 24 * 60 * 60 * 1000;
const TRANSCRIPT_TRANSLATION_CHUNK_SIZE = 60;
const transcriptTranslationInFlight = new Map();

function ytCacheGet(key) {
  const entry = ytCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { ytCache.delete(key); return null; }
  return entry.data;
}

function ytCacheSet(key, data, ttlMs) {
  ytCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

async function ytFetch(apiKey, endpoint, params) {
  const url = new URL(`${YT_BASE}/${endpoint}`);
  url.searchParams.set("key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const cacheKey = url.toString();
  const cached = ytCacheGet(cacheKey);
  if (cached) return cached;

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const rawMessage = err?.error?.message || `YouTube API ${res.status}`;
    const reasons = Array.isArray(err?.error?.errors)
      ? err.error.errors.map((item) => String(item?.reason || "")).filter(Boolean)
      : [];
    throw new Error(normalizeYouTubeApiErrorMessage(rawMessage, reasons));
  }
  const data = await res.json();
  ytCacheSet(cacheKey, data, 5 * 60 * 1000); // 5 min
  return data;
}

function normalizeYouTubeApiErrorMessage(message, reasons = []) {
  if (reasons.some((reason) => /quota|dailyLimitExceeded/i.test(reason))) {
    return "YouTube Data API daily quota reached. Try again after the quota resets at midnight Pacific Time.";
  }

  return decodeHtmlEntities(stripHtmlTags(String(message || ""))).replace(/\s+/g, " ").trim() || "YouTube API request failed.";
}

function stripHtmlTags(value) {
  return String(value || "").replace(/<[^>]*>/g, "");
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Parses ISO 8601 duration (PT4M13S) → total seconds.
function parseDurationSeconds(iso) {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || 0, 10) * 3600) + (parseInt(m[2] || 0, 10) * 60) + parseInt(m[3] || 0, 10);
}

function parseDuration(iso) {
  return Math.max(1, Math.round(parseDurationSeconds(iso) / 60));
}

function isLikelyYouTubeShort({ title, description, durationSeconds }) {
  const metadata = `${title} ${description}`.toLowerCase();
  if (metadata.includes("#shorts")) return true;
  if (metadata.includes("youtube shorts")) return true;
  if (/\bshorts\b/.test(metadata) && durationSeconds <= 180) return true;
  return durationSeconds > 0 && durationSeconds <= 180; // YouTube Shorts can now be up to 3 min
}

// Deterministic approximate vocabulary rank (500–50000) based on videoId string hash.
// Replace with real transcript word-frequency analysis in future.
function approxVocabScore(videoId, viewCount) {
  let h = 0;
  for (let i = 0; i < videoId.length; i++) h = ((h << 5) - h + videoId.charCodeAt(i)) | 0;
  const base = 500 + (Math.abs(h) % 29500); // 500–30000
  // Higher view count → push toward lower (easier) end slightly
  const viewAdj = Math.min(viewCount / 1_000_000, 1) * 5000;
  return Math.max(500, Math.round(base - viewAdj));
}

const CURATED_HANDLES = [
  { handle: "TEDed",                     label: "Education"         },
  { handle: "BBCLearningEnglish",        label: "British English"   },
  { handle: "RachelsEnglish",            label: "Pronunciation"     },
  { handle: "EnglishwithLucy",           label: "General English"   },
  { handle: "SpeakEnglishWithVanessa",   label: "Daily English"     },
  { handle: "EasyEnglish96",             label: "Street interviews" },
  { handle: "VoaLearningEnglish",        label: "News English"      },
  { handle: "RealLifeEnglish",           label: "Conversational"    },
  { handle: "LearnEnglishwithTVSeries",  label: "Pop culture"       },
  { handle: "EnglishAddict",             label: "Listening"         },
];
const CURATED_CHANNEL_SEEDS = loadCuratedChannelSeeds();

const channelCache = new Map(); // handle → channel object, long TTL

function formatChannelResult(item, { handle = "", label = "" } = {}) {
  if (!item?.id) return null;

  return {
    id: item.id,
    handle,
    name: item.snippet?.title || handle || "YouTube channel",
    label,
    thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "",
    videoCount: parseInt(item.statistics?.videoCount || "0", 10),
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads || "",
  };
}

function loadCuratedChannelSeeds() {
  if (!existsSync(YOUTUBE_CHANNEL_SEEDS_FILE)) return [];

  const seenSlugs = new Map();
  return readFileSync(YOUTUBE_CHANNEL_SEEDS_FILE, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const name = cleanChannelSeedLabel(line);
      const query = cleanChannelSeedQuery(name);
      const baseSlug = slugifyChannelSeed(query || name) || `channel-${index + 1}`;
      const duplicateIndex = seenSlugs.get(baseSlug) || 0;
      seenSlugs.set(baseSlug, duplicateIndex + 1);

      return {
        id: duplicateIndex === 0 ? `seed:${baseSlug}` : `seed:${baseSlug}-${duplicateIndex + 1}`,
        handle: query,
        name,
        label: "Seeded channel",
        thumbnail: "",
        videoCount: 0,
      };
    });
}

function cleanChannelSeedLabel(value) {
  return String(value || "")
    .replace(/^\s*\d+\.\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanChannelSeedQuery(value) {
  return cleanChannelSeedLabel(value)
    .replace(/(?:\.\.\.|…)+$/u, "")
    .replace(/\s+$/g, "")
    .trim();
}

function normalizeChannelSeedText(value) {
  return cleanChannelSeedQuery(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugifyChannelSeed(value) {
  return normalizeChannelSeedText(value).replace(/\s+/g, "-");
}

function scoreChannelSeedCandidate(query, title) {
  const normalizedQuery = normalizeChannelSeedText(query);
  const normalizedTitle = normalizeChannelSeedText(title);
  if (!normalizedQuery || !normalizedTitle) return 0;
  if (normalizedQuery === normalizedTitle) return 1000;
  if (normalizedTitle.startsWith(normalizedQuery)) return 850;
  if (normalizedTitle.includes(normalizedQuery)) return 700;

  const queryTokens = normalizedQuery.split(" ").filter((token) => token.length > 1);
  const matchedTokens = queryTokens.filter((token) => normalizedTitle.includes(token)).length;
  if (!matchedTokens) return 0;

  return (matchedTokens * 80) + (matchedTokens === queryTokens.length ? 200 : 0);
}

function pickBestSeedCandidate(query, items) {
  const ranked = items
    .map((item) => ({
      item,
      score: scoreChannelSeedCandidate(query, item?.snippet?.title || ""),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.item || null;
}

function getRendererText(value) {
  if (!value) return "";
  if (typeof value.simpleText === "string") return value.simpleText;
  if (Array.isArray(value.runs)) {
    return value.runs.map((item) => String(item?.text || "")).join("").trim();
  }
  return "";
}

function collectChannelRenderers(node, results = []) {
  if (!node || typeof node !== "object") return results;

  if (node.channelRenderer) {
    results.push(node.channelRenderer);
  }

  if (Array.isArray(node)) {
    for (const item of node) collectChannelRenderers(item, results);
    return results;
  }

  for (const value of Object.values(node)) {
    collectChannelRenderers(value, results);
  }

  return results;
}

function extractJsonObjectAfterMarker(html, marker) {
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;

  const startIndex = html.indexOf("{", markerIndex);
  if (startIndex === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < html.length; index += 1) {
    const char = html[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;

    if (depth === 0) {
      return html.slice(startIndex, index + 1);
    }
  }

  return null;
}

function extractYouTubeInitialData(html) {
  const jsonText = extractJsonObjectAfterMarker(html, "var ytInitialData =")
    || extractJsonObjectAfterMarker(html, "ytInitialData =")
    || extractJsonObjectAfterMarker(html, "window[\"ytInitialData\"] =");

  if (!jsonText) return null;

  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

async function resolveChannelSeedPublic(channelSeed) {
  const query = cleanChannelSeedQuery(channelSeed);
  if (!query) return null;

  const cacheKey = `seed-public:${normalizeChannelSeedText(query)}`;
  const cached = ytCacheGet(cacheKey);
  if (cached) return cached;

  try {
    const url = new URL("https://www.youtube.com/results");
    url.searchParams.set("search_query", query);

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    const initialData = extractYouTubeInitialData(html);
    if (!initialData) return null;

    const renderers = collectChannelRenderers(initialData);
    const matched = pickBestSeedCandidate(
      query,
      renderers.map((renderer) => ({
        id: { channelId: renderer.channelId },
        snippet: { title: getRendererText(renderer.title) },
        renderer,
      })),
    );

    const renderer = matched?.renderer;
    if (!renderer?.channelId) return null;

    const result = {
      channelId: renderer.channelId,
      name: getRendererText(renderer.title) || query,
      thumbnail: renderer.thumbnail?.thumbnails?.[renderer.thumbnail.thumbnails.length - 1]?.url || "",
    };

    ytCacheSet(cacheKey, result, 7 * 24 * 60 * 60 * 1000);
    return result;
  } catch (error) {
    console.warn(`[YT] public seed lookup "${query}" failed:`, error.message);
    return null;
  }
}

async function fetchChannelByHandle(apiKey, handle, label = "") {
  const cacheKey = `channel-handle:${handle}`;
  if (channelCache.has(cacheKey)) return channelCache.get(cacheKey);

  try {
    const data = await ytFetch(apiKey, "channels", {
      part: "snippet,statistics,contentDetails",
      forHandle: handle,
      maxResults: 1,
    });
    const result = formatChannelResult(data.items?.[0], { handle, label });
    channelCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn(`[YT] channel @${handle} failed:`, error.message);
    channelCache.set(cacheKey, null);
    return null;
  }
}

async function fetchChannelById(apiKey, channelId, fallback = {}) {
  const cacheKey = `channel-id:${channelId}`;
  if (channelCache.has(cacheKey)) return channelCache.get(cacheKey);

  try {
    const data = await ytFetch(apiKey, "channels", {
      part: "snippet,statistics,contentDetails",
      id: channelId,
      maxResults: 1,
    });
    const result = formatChannelResult(data.items?.[0], fallback);
    channelCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn(`[YT] channel id "${channelId}" failed:`, error.message);
    channelCache.set(cacheKey, null);
    return null;
  }
}

async function fetchCuratedChannels(apiKey) {
  const cacheKey = "curated-channels";
  const cached = ytCacheGet(cacheKey);
  if (cached) return cached;

  const results = (await Promise.all(
    CURATED_HANDLES.map((channel) => fetchChannelByHandle(apiKey, channel.handle, channel.label)),
  )).filter(Boolean);

  ytCacheSet(cacheKey, results, 30 * 60 * 1000); // 30 min
  return results;
}

async function resolveChannelSeed(apiKey, channelSeed) {
  const query = cleanChannelSeedQuery(channelSeed);
  if (!query) return null;

  const cacheKey = `seed:${normalizeChannelSeedText(query)}`;
  if (channelCache.has(cacheKey)) return channelCache.get(cacheKey);

  const publicMatch = await resolveChannelSeedPublic(query);
  if (publicMatch?.channelId) {
    const result = await fetchChannelById(apiKey, publicMatch.channelId, {
      handle: query,
      label: "Resolved channel",
    });
    channelCache.set(cacheKey, result);
    return result;
  }

  try {
    const searchData = await ytFetch(apiKey, "search", {
      part: "snippet",
      type: "channel",
      q: query,
      maxResults: 5,
    });

    const matchedItem = pickBestSeedCandidate(query, searchData.items || []);
    const matchedChannelId = matchedItem?.id?.channelId;
    if (!matchedChannelId) {
      channelCache.set(cacheKey, null);
      return null;
    }

    const result = await fetchChannelById(apiKey, matchedChannelId, {
      handle: query,
      label: "Resolved channel",
    });
    channelCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn(`[YT] channel seed "${query}" failed:`, error.message);
    channelCache.set(cacheKey, null);
    return null;
  }
}

async function fetchVideosForChannelSeed(apiKey, { channelSeed, sort, pageToken }) {
  const resolvedChannel = await resolveChannelSeed(apiKey, channelSeed);
  if (resolvedChannel?.id) {
    return fetchYouTubeVideos(apiKey, { channelId: resolvedChannel.id, sort, pageToken, q: "" });
  }

  return fetchYouTubeVideos(apiKey, {
    channelId: "",
    sort,
    pageToken,
    q: cleanChannelSeedQuery(channelSeed),
  });
}

async function fetchYouTubeVideos(apiKey, { channelId, sort, pageToken, q }) {
  if (!channelId && !q) {
    return fetchCuratedYouTubeVideos(apiKey, { sort, pageToken });
  }

  if (channelId) {
    const channel = await fetchChannelById(apiKey, channelId);
    if (channel?.uploadsPlaylistId) {
      return fetchPlaylistBackedVideos(apiKey, {
        playlistId: channel.uploadsPlaylistId,
        sort,
        pageToken,
        sampleSize: sort === "viewCount" ? 120 : 75,
      });
    }
  }

  const searchParams = {
    part: "snippet",
    type: "video",
    order: sort,
    maxResults: 25,
    relevanceLanguage: "en",
    videoDuration: "medium", // exclude Shorts (< 4 min) at the API level
  };
  if (channelId) searchParams.channelId = channelId;
  if (pageToken)  searchParams.pageToken = pageToken;
  // If no channel selected and no search query, default to "learn english"
  if (q)          searchParams.q = q;
  else if (!channelId) searchParams.q = "learn english";

  const searchData = await ytFetch(apiKey, "search", searchParams);
  const items = searchData.items || [];
  const videoIds = items.map(i => i.id?.videoId).filter(Boolean).join(",");

  let statsMap = {};
  if (videoIds) {
    const statsData = await ytFetch(apiKey, "videos", {
      part: "statistics,contentDetails",
      id: videoIds,
    });
    for (const v of (statsData.items || [])) {
      statsMap[v.id] = {
        viewCount:  parseInt(v.statistics?.viewCount  || "0"),
        duration:   v.contentDetails?.duration || "",
      };
    }
  }

  const videos = items
    .map(item => {
      const videoId = item.id?.videoId;
      if (!videoId) return null;
      const stats = statsMap[videoId] || {};
      const viewCount = stats.viewCount || 0;
      const durationSeconds = parseDurationSeconds(stats.duration);
      return {
        id:            videoId,
        title:         item.snippet.title,
        channelId:     item.snippet.channelId,
        channelTitle:  item.snippet.channelTitle,
        description:   (item.snippet.description || "").slice(0, 300),
        thumbnail:     item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || "",
        publishedAt:   item.snippet.publishedAt,
        viewCount,
        durationSeconds,
        durationMinutes: parseDuration(stats.duration),
        vocabScore:    approxVocabScore(videoId, viewCount),
      };
    })
    .filter(Boolean)
    .filter((video) => !isLikelyYouTubeShort(video));

  return {
    videos,
    nextPageToken:  searchData.nextPageToken || null,
    totalResults:   searchData.pageInfo?.totalResults || videos.length,
  };
}

async function fetchPlaylistWindow(apiKey, { playlistId, limit = 75 }) {
  const cacheKey = `playlist-window:${playlistId}:${limit}`;
  const cached = ytCacheGet(cacheKey);
  if (cached) return cached;

  const items = [];
  let nextPageToken = "";

  while (items.length < limit) {
    const batch = await ytFetch(apiKey, "playlistItems", {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: Math.min(50, limit - items.length),
      pageToken: nextPageToken,
    });

    items.push(...(batch.items || []));
    if (!batch.nextPageToken) break;
    nextPageToken = batch.nextPageToken;
  }

  ytCacheSet(cacheKey, items, 15 * 60 * 1000);
  return items;
}

async function fetchYouTubeVideoDetails(apiKey, videoIds) {
  const detailsMap = {};

  for (let index = 0; index < videoIds.length; index += 50) {
    const chunk = videoIds.slice(index, index + 50);
    if (!chunk.length) continue;

    const data = await ytFetch(apiKey, "videos", {
      part: "snippet,statistics,contentDetails",
      id: chunk.join(","),
    });

    for (const video of data.items || []) {
      detailsMap[video.id] = {
        snippet: video.snippet || {},
        viewCount: parseInt(video.statistics?.viewCount || "0", 10),
        duration: video.contentDetails?.duration || "",
      };
    }
  }

  return detailsMap;
}

function buildPlaylistOffsetToken(playlistId, sort, offset) {
  return `playlist:${playlistId}:${sort}:${offset}`;
}

function parsePlaylistOffset(pageToken, playlistId, sort) {
  const prefix = `playlist:${playlistId}:${sort}:`;
  if (!pageToken || !pageToken.startsWith(prefix)) return 0;

  const value = Number(pageToken.slice(prefix.length));
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

async function fetchPlaylistBackedVideos(apiKey, { playlistId, sort, pageToken, sampleSize }) {
  const pageSize = 25;
  const offset = parsePlaylistOffset(pageToken, playlistId, sort);
  const playlistItems = await fetchPlaylistWindow(apiKey, { playlistId, limit: sampleSize });

  const videoIds = playlistItems
    .map((item) => item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId || "")
    .filter(Boolean);

  const detailsMap = await fetchYouTubeVideoDetails(apiKey, videoIds);
  const videos = videoIds
    .map((videoId) => {
      const details = detailsMap[videoId];
      const snippet = details?.snippet || {};
      const viewCount = details?.viewCount || 0;
      const durationSeconds = parseDurationSeconds(details?.duration || "");

      return {
        id: videoId,
        title: snippet.title || "",
        channelId: snippet.channelId || "",
        channelTitle: snippet.channelTitle || "",
        description: (snippet.description || "").slice(0, 300),
        thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "",
        publishedAt: snippet.publishedAt || "",
        viewCount,
        durationSeconds,
        durationMinutes: parseDuration(details?.duration || ""),
        vocabScore: approxVocabScore(videoId, viewCount),
      };
    })
    .filter((video) => video.id && video.title)
    .filter((video) => !isLikelyYouTubeShort(video));

  videos.sort((a, b) => {
    if (sort === "viewCount") return b.viewCount - a.viewCount;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  const pagedVideos = videos.slice(offset, offset + pageSize);
  const nextPageToken = offset + pageSize < videos.length
    ? buildPlaylistOffsetToken(playlistId, sort, offset + pageSize)
    : null;

  return {
    videos: pagedVideos,
    nextPageToken,
    totalResults: videos.length,
  };
}

async function fetchCuratedYouTubeVideos(apiKey, { sort, pageToken }) {
  const channels = await fetchCuratedChannels(apiKey);
  const offset = parseCuratedOffset(pageToken);
  const pageSize = 25;
  const maxResultsPerChannel = sort === "viewCount" ? 12 : 8;

  const playlistResults = await Promise.all(
    channels
      .filter((channel) => channel.uploadsPlaylistId)
      .map((channel) => fetchPlaylistWindow(apiKey, {
        playlistId: channel.uploadsPlaylistId,
        limit: maxResultsPerChannel,
      })),
  );

  const uniqueItems = [];
  const seenVideoIds = new Set();

  for (const playlistItems of playlistResults) {
    for (const item of playlistItems || []) {
      const videoId = item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId;
      if (!videoId || seenVideoIds.has(videoId)) continue;
      seenVideoIds.add(videoId);
      uniqueItems.push(videoId);
    }
  }

  const detailsMap = await fetchYouTubeVideoDetails(apiKey, uniqueItems);

  const videos = uniqueItems
    .map((videoId) => {
      const details = detailsMap[videoId] || {};
      const snippet = details.snippet || {};
      const viewCount = details.viewCount || 0;
      const durationSeconds = parseDurationSeconds(details.duration || "");

      return {
        id: videoId,
        title: snippet.title || "",
        channelId: snippet.channelId || "",
        channelTitle: snippet.channelTitle || "",
        description: (snippet.description || "").slice(0, 300),
        thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "",
        publishedAt: snippet.publishedAt || "",
        viewCount,
        durationSeconds,
        durationMinutes: parseDuration(details.duration || ""),
        vocabScore: approxVocabScore(videoId, viewCount),
      };
    })
    .filter((video) => video.id && video.title)
    .filter((video) => !isLikelyYouTubeShort(video));

  videos.sort((a, b) => {
    if (sort === "viewCount") return b.viewCount - a.viewCount;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  const pagedVideos = videos.slice(offset, offset + pageSize);
  const nextPageToken = offset + pageSize < videos.length ? `curated:${offset + pageSize}` : null;

  return {
    videos: pagedVideos,
    nextPageToken,
    totalResults: videos.length,
  };
}

async function fetchYouTubeVideoStats(apiKey, videoIds) {
  const statsMap = {};

  for (let index = 0; index < videoIds.length; index += 50) {
    const chunk = videoIds.slice(index, index + 50);
    if (!chunk.length) continue;

    const statsData = await ytFetch(apiKey, "videos", {
      part: "statistics,contentDetails",
      id: chunk.join(","),
    });

    for (const video of statsData.items || []) {
      statsMap[video.id] = {
        viewCount: parseInt(video.statistics?.viewCount || "0", 10),
        duration: video.contentDetails?.duration || "",
      };
    }
  }

  return statsMap;
}

function parseCuratedOffset(pageToken) {
  if (!pageToken) return 0;
  if (!pageToken.startsWith("curated:")) return 0;

  const value = Number(pageToken.slice("curated:".length));
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

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

function getTranscriptEntriesWithCachedTranslations({ videoId, entries }) {
  const cacheKey = `transcript-translation:${videoId}`;
  const cachedTranslations = ytCacheGet(cacheKey);

  if (Array.isArray(cachedTranslations) && cachedTranslations.length === entries.length) {
    return entries.map((entry, index) => ({
      ...entry,
      translation: cachedTranslations[index] || "",
    }));
  }

  return entries.map((entry) => ({
    ...entry,
    translation: "",
  }));
}

async function primeTranscriptTranslations({ videoId, entries, preferredProvider }) {
  const cacheKey = `transcript-translation:${videoId}`;
  const cachedTranslations = ytCacheGet(cacheKey);

  if (Array.isArray(cachedTranslations) && cachedTranslations.length === entries.length) {
    return cachedTranslations;
  }

  if (transcriptTranslationInFlight.has(cacheKey)) {
    return transcriptTranslationInFlight.get(cacheKey);
  }

  const translationPromise = (async () => {
    try {
      const translations = [];

      for (let index = 0; index < entries.length; index += TRANSCRIPT_TRANSLATION_CHUNK_SIZE) {
        const chunk = entries.slice(index, index + TRANSCRIPT_TRANSLATION_CHUNK_SIZE);
        const result = await requestJsonFromProviders({
          preferredProvider,
          systemPrompt: TRANSCRIPT_TRANSLATION_SYSTEM_PROMPT,
          userPrompt: buildTranscriptTranslationPrompt(chunk),
        });

        translations.push(...normalizeTranscriptTranslationBatch(result, chunk.length));
      }

      ytCacheSet(cacheKey, translations, TRANSCRIPT_TRANSLATION_TTL_MS);
      return translations;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transcript translation failed";
      console.warn(`[Transcript] Somali translation unavailable for ${videoId}: ${message}`);
      return [];
    } finally {
      transcriptTranslationInFlight.delete(cacheKey);
    }
  })();

  transcriptTranslationInFlight.set(cacheKey, translationPromise);
  return translationPromise;
}

async function translateTranscriptEntriesToSomali({ videoId, entries, preferredProvider }) {
  const cachedEntries = getTranscriptEntriesWithCachedTranslations({ videoId, entries });
  if (cachedEntries.every((entry) => Boolean(entry.translation))) {
    return cachedEntries;
  }

  try {
    const translations = await primeTranscriptTranslations({ videoId, entries, preferredProvider });

    return entries.map((entry, index) => ({
      ...entry,
      translation: translations[index] || "",
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcript translation failed";
    console.warn(`[Transcript] Somali translation unavailable for ${videoId}: ${message}`);

    return entries.map((entry) => ({
      ...entry,
      translation: "",
    }));
  }
}

function buildTranscriptTranslationPrompt(entries) {
  const lines = entries.map((entry, index) => `${index + 1}. ${entry.text}`);
  return `Translate these English subtitle lines into Somali and return JSON only.\n\n${lines.join("\n")}`;
}

function normalizeTranscriptTranslationBatch(result, expectedLength) {
  const raw = Array.isArray(result?.translations)
    ? result.translations.map((item) =>
        String(item || "")
          .replace(/^\d+\.\s*/, "") // strip leading numbering the AI sometimes adds
          .replace(/\s+/g, " ")
          .trim(),
      )
    : [];

  if (raw.length !== expectedLength) {
    console.warn(`[Transcript] Translation count mismatch: got ${raw.length}, expected ${expectedLength}. Padding/truncating.`);
  }

  // Truncate if too many, pad with empty strings if too few — never throw.
  const translations = raw.slice(0, expectedLength);
  while (translations.length < expectedLength) translations.push("");
  return translations;
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
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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

const STORY_SYSTEM_PROMPT = `You are an English learning story writer for beginners and intermediate learners (A2-B1 level). When given a list of words, write a short simple story (100-160 words) that uses ALL the given words naturally. Rules:
- Use very simple, everyday sentences. Short sentences are better.
- No difficult vocabulary beyond the given words.
- The story should be fun and easy to understand.
- Bold the given words using **word** markdown.
- First line must be the story title formatted exactly as: TITLE: Your Story Title
- Then a blank line, then the story.
- Return plain text only, no JSON, no extra commentary.`;

async function generateStory(words, preferredProvider) {
  const wordList = words.join(", ");
  const raw = await requestTextFromProviders({
    preferredProvider,
    systemPrompt: STORY_SYSTEM_PROMPT,
    userPrompt: `Write a simple English learning story using all of these words: ${wordList}`,
  });

  // Parse title from first line
  const lines = raw.trim().split("\n");
  let title = "Untitled Story";
  let content = raw.trim();

  const titleLine = lines[0].trim();
  if (titleLine.toUpperCase().startsWith("TITLE:")) {
    title = titleLine.slice(6).trim();
    content = lines.slice(1).join("\n").trim();
  }

  return { title, content };
}

async function generateTextWithGemini(systemPrompt, userPrompt) {
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in .env.local");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    }),
  });

  if (!response.ok) throw new Error(`Gemini request failed: ${await response.text()}`);

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

async function requestTextFromProviders({ preferredProvider, systemPrompt, userPrompt }) {
  const providers = getProviderChain(preferredProvider);
  const errors = [];

  for (const provider of providers) {
    try {
      // Use text-mode (no JSON mime type) for all providers
      if (provider === "gemini") return await generateTextWithGemini(systemPrompt, userPrompt);
      if (provider === "grok") return await explainWithGrokPrompt(systemPrompt, userPrompt);
      if (provider === "openrouter") return await explainWithOpenRouterPrompt(systemPrompt, userPrompt);
      if (provider === "cerebras") return await explainWithCerebrasPrompt(systemPrompt, userPrompt);
      if (provider === "antigravity") return await explainWithAntigravityPrompt(systemPrompt, userPrompt);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider error";
      errors.push({ provider, message: summarizeProviderError(provider, message) });
    }
  }

  throw new Error(summarizeCombinedProviderErrors(errors));
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
