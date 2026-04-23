import { execFileSync } from "node:child_process";
import { basename, extname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";

const MAX_SQLITE_BUFFER = 100 * 1024 * 1024;
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".webm"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".avif"]);
const LEGACY_IMPORTED_FILE = ["server", "data", "imported-phrase-bank.json"];
const LEGACY_IMPORTED_MEDIA_DIR = ["server", "data", "imported-phrase-bank-media"];
const IMPORTED_BANKS_DIR = ["server", "data", "imported-phrase-banks"];
const IMPORTED_BANKS_INDEX_FILE = ["server", "data", "imported-phrase-banks", "index.json"];

export function getImportedPhraseBanksDir(rootDir) {
  return join(rootDir, ...IMPORTED_BANKS_DIR);
}

export function getImportedPhraseBanksIndexFile(rootDir) {
  return join(rootDir, ...IMPORTED_BANKS_INDEX_FILE);
}

export function getImportedPhraseBankDir(rootDir, deckId) {
  return join(getImportedPhraseBanksDir(rootDir), deckId);
}

export function getImportedPhraseBankFile(rootDir, deckId) {
  return join(getImportedPhraseBankDir(rootDir, deckId), "deck.json");
}

export function getImportedPhraseBankMediaDir(rootDir, deckId) {
  return join(getImportedPhraseBankDir(rootDir, deckId), "media");
}

export function loadImportedPhraseBanks(rootDir) {
  migrateLegacyImportedDeck(rootDir);
  const indexFile = getImportedPhraseBanksIndexFile(rootDir);
  if (!existsSync(indexFile)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(indexFile, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadImportedPhraseBank(rootDir, deckId) {
  migrateLegacyImportedDeck(rootDir);

  if (deckId) {
    const filePath = getImportedPhraseBankFile(rootDir, deckId);
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      return normalizeImportedDeckPayload(JSON.parse(readFileSync(filePath, "utf8")));
    } catch {
      return null;
    }
  }

  const decks = loadImportedPhraseBanks(rootDir)
    .map((deck) => loadImportedPhraseBank(rootDir, deck.deckId))
    .filter(Boolean);

  if (!decks.length) {
    return null;
  }

  return mergeImportedPhraseBanks(decks);
}

export function deleteImportedPhraseBank(rootDir, deckId) {
  if (!deckId) {
    rmSync(getImportedPhraseBanksDir(rootDir), { recursive: true, force: true });
    rmSync(join(rootDir, ...LEGACY_IMPORTED_FILE), { force: true });
    rmSync(join(rootDir, ...LEGACY_IMPORTED_MEDIA_DIR), { recursive: true, force: true });
    return;
  }

  rmSync(getImportedPhraseBankDir(rootDir, deckId), { recursive: true, force: true });
  saveImportedPhraseBanksIndex(
    rootDir,
    loadImportedPhraseBanks(rootDir).filter((deck) => deck.deckId !== deckId)
  );
}

export function importAnkiPackage({ buffer, rootDir, fileName = "Uploaded Anki deck" }) {
  migrateLegacyImportedDeck(rootDir);
  const tempDir = mkdtempSync(join(tmpdir(), "anki-import-"));
  const apkgPath = join(tempDir, "deck.apkg");

  try {
    writeFileSync(apkgPath, buffer);
    execFileSync("unzip", ["-q", apkgPath, "-d", tempDir], { stdio: "pipe" });

    const dbPath21 = join(tempDir, "collection.anki21");
    const dbPath2 = join(tempDir, "collection.anki2");
    const dbPath = existsSync(dbPath21) ? dbPath21 : dbPath2;
    if (!existsSync(dbPath)) {
      throw new Error("No Anki database found in file");
    }

    const deckId = createDeckId(fileName);
    const mediaLookup = persistMediaFiles(rootDir, tempDir, deckId);
    const models = readModels(dbPath);
    const rows = readNoteRows(dbPath);
    const sourceLabel = fileName.replace(/\.apkg$/i, "").trim() || "Uploaded Anki deck";
    const byDiff = { beginner: 0, intermediate: 0, advanced: 0 };
    const usedAudio = new Set();
    const usedImages = new Set();
    const seenWords = new Set();
    const entries = [];

    for (const row of rows) {
      const parsed = parseNoteRow(row, models, mediaLookup, sourceLabel);
      if (!parsed) {
        continue;
      }

      const key = parsed.phraseText.toLowerCase();
      if (seenWords.has(key)) {
        continue;
      }
      seenWords.add(key);

      byDiff[parsed.difficultyLevel] += 1;
      parsed.sourceAudio?.forEach((url) => usedAudio.add(url));
      parsed.sourceImages?.forEach((url) => usedImages.add(url));
      entries.push(parsed);
    }

    const payload = {
      deckId,
      sourceName: fileName,
      sourceLabel,
      importedAt: new Date().toISOString(),
      parsedLines: rows.length,
      totalEntries: entries.length,
      mediaCounts: {
        audio: usedAudio.size,
        images: usedImages.size,
      },
      entries,
    };

    if (entries.length === 0) {
      throw new Error("Could not extract usable entries from this deck");
    }

    const outPath = getImportedPhraseBankFile(rootDir, deckId);
    mkdirSync(getImportedPhraseBankDir(rootDir, deckId), { recursive: true });
    writeFileSync(outPath, JSON.stringify(payload, null, 2));
    saveImportedPhraseBanksIndex(rootDir, [
      createDeckSummary(payload),
      ...loadImportedPhraseBanks(rootDir),
    ]);

    return {
      payload,
      summary: {
        deckId,
        count: entries.length,
        byDiff,
        mediaCounts: payload.mediaCounts,
        sourceLabel,
      },
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function readNoteRows(dbPath) {
  const rawOutput = execFileSync(
    "sqlite3",
    [dbPath, "SELECT mid, hex(flds), hex(tags) FROM notes;"],
    { encoding: "utf8", maxBuffer: MAX_SQLITE_BUFFER }
  ).trim();

  if (!rawOutput) {
    return [];
  }

  return rawOutput
    .split("\n")
    .map((line) => {
      const [midRaw = "", fldsHex = "", tagsHex = ""] = line.split("|");

      return {
        mid: Number(midRaw),
        flds: decodeHexField(fldsHex),
        tags: decodeHexField(tagsHex),
      };
    });
}

function readModels(dbPath) {
  const rawModels = execFileSync("sqlite3", [dbPath, "SELECT models FROM col;"], {
    encoding: "utf8",
    maxBuffer: MAX_SQLITE_BUFFER,
  }).trim();

  if (!rawModels) {
    return new Map();
  }

  let parsed;
  try {
    parsed = JSON.parse(rawModels);
  } catch {
    return new Map();
  }

  return new Map(
    Object.entries(parsed).map(([id, model]) => {
      const fields = Array.isArray(model?.flds)
        ? model.flds
            .slice()
            .sort((a, b) => Number(a?.ord || 0) - Number(b?.ord || 0))
            .map((field) => String(field?.name || ""))
        : [];

      return [
        Number(id),
        {
          name: String(model?.name || ""),
          fields,
        },
      ];
    })
  );
}

function decodeHexField(value) {
  if (!value) {
    return "";
  }

  return Buffer.from(value, "hex").toString("utf8");
}

function persistMediaFiles(rootDir, tempDir, deckId) {
  const mediaFile = join(tempDir, "media");
  const mediaDir = getImportedPhraseBankMediaDir(rootDir, deckId);
  rmSync(mediaDir, { recursive: true, force: true });
  mkdirSync(mediaDir, { recursive: true });

  if (!existsSync(mediaFile)) {
    return new Map();
  }

  let mediaMap = {};
  try {
    mediaMap = JSON.parse(readFileSync(mediaFile, "utf8"));
  } catch {
    mediaMap = {};
  }

  const lookup = new Map();
  for (const [internalName, originalNameRaw] of Object.entries(mediaMap)) {
    const originalName = basename(String(originalNameRaw || "").trim());
    if (!originalName) {
      continue;
    }

    const sourcePath = join(tempDir, internalName);
    if (!existsSync(sourcePath)) {
      continue;
    }

    const safeName = `${internalName}-${sanitizeFileName(originalName)}`;
    copyFileSync(sourcePath, join(mediaDir, safeName));
    lookup.set(originalName, `/api/imported-phrase-banks/${encodeURIComponent(deckId)}/media/${encodeURIComponent(safeName)}`);
  }

  return lookup;
}

function parseNoteRow(row, models, mediaLookup, sourceLabel) {
  const rawFields = row.flds.split("\x1f");
  const model = models.get(row.mid);
  const namedFields = mapNamedFields(model, rawFields);
  const explicit = parseKnownModelRow({ row, model, namedFields, mediaLookup, sourceLabel });
  if (explicit) {
    return explicit;
  }

  const flatSegments = rawFields.flatMap(expandFieldSegments);
  const word = pickWordCandidate(flatSegments);
  if (!word) {
    return null;
  }

  const audioRefs = unique(rawFields.flatMap(extractAudioRefs));
  const imageRefs = unique(rawFields.flatMap(extractImageRefs));
  const sourceAudio = unique(
    audioRefs
      .map((ref) => mediaLookup.get(basename(ref)))
      .filter(Boolean)
  );
  const sourceImages = unique(
    imageRefs
      .map((ref) => mediaLookup.get(basename(ref)))
      .filter(Boolean)
  );

  let sourceMeaning = "";
  let sourceExample = "";
  for (const segment of flatSegments) {
    const cleaned = cleanSegmentText(segment);
    if (!cleaned || cleaned.toLowerCase() === word.toLowerCase()) {
      continue;
    }
    if (looksLikePronunciation(cleaned)) {
      continue;
    }

    if (!sourceMeaning && !looksLikeExample(cleaned)) {
      sourceMeaning = cleaned;
      continue;
    }

    if (!sourceExample && looksLikeExample(cleaned)) {
      sourceExample = sanitizeImportedExample(cleaned, word, sourceMeaning) || "";
    }

    if (sourceMeaning && sourceExample) {
      break;
    }
  }

  return {
    phraseText: word,
    phraseType: word.split(/\s+/).length === 1 ? "word" : "phrase",
    category: "Vocabulary",
    difficultyLevel: inferDifficulty(row.tags, rawFields),
    isCommon: inferDifficulty(row.tags, rawFields) === "beginner",
    sourceMeaning: sourceMeaning || undefined,
    sourceExample: sourceExample || undefined,
    sourceExtraFields: collectExtraFieldsFromNamedFields(namedFields, {
      skipValues: [word, sourceMeaning, sourceExample],
    }),
    sourceAudio: sourceAudio.length ? sourceAudio : undefined,
    sourceImages: sourceImages.length ? sourceImages : undefined,
    source: sourceLabel,
  };
}

function mapNamedFields(model, rawFields) {
  if (!model?.fields?.length) {
    return {};
  }

  return Object.fromEntries(model.fields.map((fieldName, index) => [fieldName, rawFields[index] || ""]));
}

function parseKnownModelRow({ row, model, namedFields, mediaLookup, sourceLabel }) {
  if (!model?.name) {
    return null;
  }

  if (model.name === "4000 EEW") {
    const phraseText = cleanSegmentText(namedFields.Word);
    if (!phraseText) {
      return null;
    }

    const sourceMeaning = cleanSegmentText(namedFields.Meaning);
    const sourceExample = sanitizeImportedExample(namedFields.Example, phraseText, sourceMeaning);
    const sourcePhonetic = cleanSegmentText(namedFields.IPA);
    const sourceAudio = resolveMediaRefs(
      [namedFields.Sound, namedFields.Sound_Meaning, namedFields.Sound_Example],
      mediaLookup,
      extractAudioRefs
    );
    const sourceImages = resolveMediaRefs([namedFields.Image], mediaLookup, extractImageRefs);

    return {
      phraseText,
      phraseType: phraseText.split(/\s+/).length === 1 ? "word" : "phrase",
      category: "Vocabulary",
      difficultyLevel: inferDifficulty(row.tags, Object.values(namedFields)),
      isCommon: inferDifficulty(row.tags, Object.values(namedFields)) === "beginner",
      sourceMeaning: sourceMeaning || undefined,
      sourceExample: sourceExample || undefined,
      sourcePhonetic: sourcePhonetic || undefined,
      sourceExtraFields: collectExtraFieldsFromNamedFields(namedFields, {
        skipLabels: ["Word", "Meaning", "Example", "IPA", "Sound", "Sound_Meaning", "Sound_Example", "Image"],
        skipValues: [phraseText, sourceMeaning, sourceExample, sourcePhonetic],
      }),
      sourceAudio: sourceAudio.length ? sourceAudio : undefined,
      sourceImages: sourceImages.length ? sourceImages : undefined,
      source: sourceLabel,
    };
  }

  if (model.name === "4000 EEW Extra") {
    const phraseText = cleanSegmentText(namedFields.English);
    if (!phraseText) {
      return null;
    }

    const sourcePhonetic = cleanSegmentText(namedFields["Am&BrTranscription"] || namedFields.Transcription);
    const sourceAudio = resolveMediaRefs([namedFields.Audio], mediaLookup, extractAudioRefs);
    const sourceImages = resolveMediaRefs([namedFields.IMG], mediaLookup, extractImageRefs);

    return {
      phraseText,
      phraseType: phraseText.split(/\s+/).length === 1 ? "word" : "phrase",
      category: "Vocabulary",
      difficultyLevel: inferDifficulty(row.tags, Object.values(namedFields)),
      isCommon: inferDifficulty(row.tags, Object.values(namedFields)) === "beginner",
      sourcePhonetic: sourcePhonetic || undefined,
      sourceExtraFields: collectExtraFieldsFromNamedFields(namedFields, {
        skipLabels: ["English", "Am&BrTranscription", "Transcription", "Audio", "IMG"],
        skipValues: [phraseText, sourcePhonetic],
      }),
      sourceAudio: sourceAudio.length ? sourceAudio : undefined,
      sourceImages: sourceImages.length ? sourceImages : undefined,
      source: sourceLabel,
    };
  }

  return null;
}

function resolveMediaRefs(rawValues, mediaLookup, extractor) {
  return unique(
    rawValues
      .flatMap((value) => extractor(value))
      .map((ref) => mediaLookup.get(basename(ref)))
      .filter(Boolean)
  );
}

function collectExtraFieldsFromNamedFields(namedFields, { skipLabels = [], skipValues = [] } = {}) {
  if (!namedFields || typeof namedFields !== "object") {
    return undefined;
  }

  const excludedLabels = new Set(skipLabels.map((label) => String(label || "").trim().toLowerCase()));
  const excludedValues = new Set(skipValues.map((value) => cleanSegmentText(value || "").toLowerCase()).filter(Boolean));
  const fields = [];

  for (const [label, rawValue] of Object.entries(namedFields)) {
    const normalizedLabel = String(label || "").trim();
    if (!normalizedLabel || excludedLabels.has(normalizedLabel.toLowerCase())) {
      continue;
    }

    if (extractAudioRefs(rawValue).length || extractImageRefs(rawValue).length) {
      continue;
    }

    const cleanedValue = cleanSegmentText(rawValue);
    if (!cleanedValue || excludedValues.has(cleanedValue.toLowerCase())) {
      continue;
    }

    fields.push({
      label: normalizedLabel,
      value: cleanedValue,
    });
  }

  return fields.length ? fields : undefined;
}

function expandFieldSegments(rawField) {
  const normalized = String(rawField || "");
  const segments = normalized
    .split(/\^_\^_?|\^_/g)
    .flatMap((part) => part.split(/\n+/g))
    .map((part) => part.trim())
    .filter(Boolean);

  return segments.length ? segments : [normalized];
}

function pickWordCandidate(segments) {
  let best = "";
  let bestScore = -1;

  for (const segment of segments) {
    const candidate = normalizeWordCandidate(segment);
    if (!candidate) {
      continue;
    }

    const score = scoreWordCandidate(candidate, segment);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function normalizeWordCandidate(segment) {
  let value = cleanSegmentText(segment);
  if (!value) {
    return "";
  }

  value = value.replace(/^[_\d.-]+\s*/, "").trim();
  if (/^\[[^\]]+\]$/.test(value)) {
    return "";
  }

  if (!/[A-Za-z]/.test(value)) {
    return "";
  }

  if (value.length > 60) {
    return "";
  }

  if (/[.!?]/.test(value) && value.split(/\s+/).length > 4) {
    return "";
  }

  return value;
}

function scoreWordCandidate(candidate, rawSegment) {
  let score = 0;
  if (/^[A-Za-z][A-Za-z' -]*$/.test(candidate)) {
    score += 10;
  }
  if (!/\d/.test(candidate)) {
    score += 3;
  }
  if (!rawSegment.includes("[") && !rawSegment.includes("]") && !rawSegment.includes("/")) {
    score += 2;
  }
  if (candidate.split(/\s+/).length === 1) {
    score += 3;
  }
  if (candidate.length <= 24) {
    score += 1;
  }

  return score;
}

function cleanSegmentText(value) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/\[sound:[^\]]+\]/gi, " ")
      .replace(/<img[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/div>/gi, " ")
      .replace(/<div[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function sanitizeImportedExample(value, phraseText = "", sourceMeaning = "") {
  const rawValue = String(value || "");
  const cleaned = cleanSegmentText(rawValue);
  if (!cleaned) {
    return "";
  }

  if (sourceMeaning && cleaned === sourceMeaning) {
    return "";
  }

  if (/[<>=]{2,}/.test(rawValue)) {
    return "";
  }

  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  const latinLetterCount = (cleaned.match(/[A-Za-z]/g) || []).length;
  const arabicLetterCount = (cleaned.match(/[\u0600-\u06FF]/g) || []).length;

  if (latinLetterCount > 0 && arabicLetterCount > 0) {
    return "";
  }

  if (wordCount < 3) {
    return "";
  }

  if (!/[.!?]/.test(cleaned) && !isLikelySentenceLikeExample(cleaned, phraseText)) {
    return "";
  }

  return cleaned;
}

function isLikelySentenceLikeExample(value, phraseText = "") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 4 || words.length > 18) {
    return false;
  }

  const lower = normalized.toLowerCase();
  const commonSentenceWords = /\b(a|an|the|to|of|in|on|for|with|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|can|could|should|my|your|his|her|their|our|this|that|these|those|i|you|he|she|they|we|it)\b/;

  if (!commonSentenceWords.test(lower)) {
    return false;
  }

  const phraseLower = String(phraseText || "").trim().toLowerCase();
  if (phraseLower && !lower.includes(phraseLower)) {
    return false;
  }

  return true;
}

function normalizeImportedDeckPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const entries = Array.isArray(payload.entries)
    ? payload.entries.map((entry) => {
        const sourceMeaning = cleanSegmentText(entry?.sourceMeaning || "");
        const sourceExample = sanitizeImportedExample(entry?.sourceExample, entry?.phraseText, sourceMeaning);

        return {
          ...entry,
          sourceMeaning: sourceMeaning || undefined,
          sourceExample: sourceExample || undefined,
          sourceExtraFields: Array.isArray(entry?.sourceExtraFields)
            ? entry.sourceExtraFields
                .map((field) => ({
                  label: String(field?.label || "").trim(),
                  value: cleanSegmentText(field?.value || ""),
                }))
                .filter((field) => field.label && field.value)
            : undefined,
        };
      })
    : [];

  return {
    ...payload,
    entries,
    totalEntries: Number(payload.totalEntries || entries.length),
  };
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function looksLikePronunciation(value) {
  const bracketed = value.startsWith("[") && value.endsWith("]");
  const slashed = value.startsWith("/") && value.endsWith("/");
  return (bracketed || slashed) && /[A-Za-z]/.test(value);
}

function looksLikeExample(value) {
  return value.length > 30 || /[.!?]/.test(value);
}

function inferDifficulty(tags, rawFields = []) {
  const match = String(tags || "").match(/[Bb]ook[_\s-]?(\d)/);
  if (match) {
    const book = Number(match[1]);
    if (book <= 2) return "beginner";
    if (book <= 4) return "intermediate";
    return "advanced";
  }

  const joinedFields = rawFields.map((field) => String(field || "")).join(" ");
  const fileMatch = joinedFields.match(/(?:^|[^0-9])(\d{2})[_-]\d{3,4}(?:[^0-9]|$)/);
  if (fileMatch) {
    const book = Number(fileMatch[1]);
    if (book <= 2) return "beginner";
    if (book <= 4) return "intermediate";
    return "advanced";
  }

  const extraMatch = joinedFields.match(/(?:^|[^0-9])(\d)_\d+(?:[^0-9]|$)/);
  if (extraMatch) {
    const book = Number(extraMatch[1]);
    if (book <= 2) return "beginner";
    if (book <= 4) return "intermediate";
    return "advanced";
  }

  return "intermediate";
}

function extractAudioRefs(value) {
  return Array.from(String(value || "").matchAll(/\[sound:([^\]]+)\]/gi), (match) => match[1].trim()).filter(Boolean);
}

function extractImageRefs(value) {
  return Array.from(
    String(value || "").matchAll(/<img[^>]+src=["']?([^"'>\s]+)["']?[^>]*>/gi),
    (match) => match[1].trim()
  ).filter(Boolean);
}

function sanitizeFileName(name) {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}

function unique(values) {
  return [...new Set(values)];
}

function createDeckId(fileName) {
  const label = sanitizeFileName(String(fileName || "uploaded-deck").replace(/\.apkg$/i, "").toLowerCase()) || "uploaded-deck";
  return `${Date.now()}-${label}`;
}

function createDeckSummary(payload) {
  return {
    deckId: payload.deckId,
    sourceName: payload.sourceName,
    sourceLabel: payload.sourceLabel,
    importedAt: payload.importedAt,
    totalEntries: payload.totalEntries,
    parsedLines: payload.parsedLines,
    mediaCounts: payload.mediaCounts || { audio: 0, images: 0 },
  };
}

function saveImportedPhraseBanksIndex(rootDir, decks) {
  mkdirSync(getImportedPhraseBanksDir(rootDir), { recursive: true });
  const uniqueDecks = [];
  const seenDeckIds = new Set();

  for (const deck of decks) {
    if (!deck?.deckId || seenDeckIds.has(deck.deckId)) {
      continue;
    }
    seenDeckIds.add(deck.deckId);
    uniqueDecks.push(deck);
  }

  writeFileSync(getImportedPhraseBanksIndexFile(rootDir), JSON.stringify(uniqueDecks, null, 2));
}

function mergeImportedPhraseBanks(decks) {
  const sortedDecks = [...decks].sort(
    (a, b) => new Date(b.importedAt || 0).getTime() - new Date(a.importedAt || 0).getTime()
  );

  return {
    sourceName: "Uploaded Anki decks",
    sourceLabel: `${sortedDecks.length} uploaded deck${sortedDecks.length === 1 ? "" : "s"}`,
    importedAt: sortedDecks[0]?.importedAt,
    parsedLines: sortedDecks.reduce((sum, deck) => sum + Number(deck.parsedLines || 0), 0),
    totalEntries: sortedDecks.reduce((sum, deck) => sum + Number(deck.totalEntries || deck.entries?.length || 0), 0),
    mediaCounts: sortedDecks.reduce(
      (counts, deck) => ({
        audio: counts.audio + Number(deck.mediaCounts?.audio || 0),
        images: counts.images + Number(deck.mediaCounts?.images || 0),
      }),
      { audio: 0, images: 0 }
    ),
    entries: sortedDecks.flatMap((deck) =>
      Array.isArray(deck.entries)
        ? deck.entries.map((entry) => ({
            ...entry,
            source: entry.source || deck.sourceLabel,
            sourceDeckId: deck.deckId,
          }))
        : []
    ),
  };
}

function migrateLegacyImportedDeck(rootDir) {
  const legacyFile = join(rootDir, ...LEGACY_IMPORTED_FILE);
  const legacyMediaDir = join(rootDir, ...LEGACY_IMPORTED_MEDIA_DIR);
  const indexFile = getImportedPhraseBanksIndexFile(rootDir);
  if (!existsSync(legacyFile) || existsSync(indexFile)) {
    return;
  }

  try {
    const payload = JSON.parse(readFileSync(legacyFile, "utf8"));
    const deckId = "legacy-uploaded-deck";
    const migratedPayload = {
      ...payload,
      deckId,
      entries: Array.isArray(payload.entries)
        ? payload.entries.map((entry) => ({
            ...entry,
            sourceAudio: (entry.sourceAudio || []).map((url) =>
              String(url).replace(
                "/api/imported-phrase-bank/media/",
                `/api/imported-phrase-banks/${encodeURIComponent(deckId)}/media/`
              )
            ),
            sourceImages: (entry.sourceImages || []).map((url) =>
              String(url).replace(
                "/api/imported-phrase-bank/media/",
                `/api/imported-phrase-banks/${encodeURIComponent(deckId)}/media/`
              )
            ),
          }))
        : [],
    };

    mkdirSync(getImportedPhraseBankDir(rootDir, deckId), { recursive: true });
    writeFileSync(getImportedPhraseBankFile(rootDir, deckId), JSON.stringify(migratedPayload, null, 2));
    if (existsSync(legacyMediaDir)) {
      renameSync(legacyMediaDir, getImportedPhraseBankMediaDir(rootDir, deckId));
    } else {
      mkdirSync(getImportedPhraseBankMediaDir(rootDir, deckId), { recursive: true });
    }

    saveImportedPhraseBanksIndex(rootDir, [createDeckSummary(migratedPayload)]);
    rmSync(legacyFile, { force: true });
  } catch {
    // Leave legacy files in place if migration fails.
  }
}

export function getImportedMediaFilePath(rootDir, deckId, requestedName) {
  const safeName = basename(String(requestedName || ""));
  if (!safeName || safeName !== requestedName) {
    return null;
  }

  const filePath = join(getImportedPhraseBankMediaDir(rootDir, deckId), safeName);
  return existsSync(filePath) ? filePath : null;
}

export function getMimeTypeForImportedMedia(fileName) {
  const ext = extname(fileName).toLowerCase();
  if (AUDIO_EXTENSIONS.has(ext)) {
    if (ext === ".mp3") return "audio/mpeg";
    if (ext === ".m4a") return "audio/mp4";
    return `audio/${ext.slice(1)}`;
  }

  if (IMAGE_EXTENSIONS.has(ext)) {
    if (ext === ".jpg") return "image/jpeg";
    return `image/${ext.slice(1)}`;
  }

  return "application/octet-stream";
}
