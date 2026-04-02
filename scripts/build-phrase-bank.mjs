import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node scripts/build-phrase-bank.mjs /absolute/path/to/file.jsonl");
  process.exit(1);
}

const outputPath = path.resolve("public/data/imported-phrase-bank.json");
const outputDir = path.dirname(outputPath);

const INCLUDED_POS = new Set(["noun", "phrase", "verb", "prep", "adj", "adv", "intj", "conj"]);
const BANNED_MARKERS = ["vulgar", "offensive", "slur", "sexual", "profanity"];
const SINGLE_WORD_POS = new Set(["noun", "verb", "adj", "adv", "intj"]);
const INFLECTION_MARKERS = [
  "plural",
  "plurals",
  "past tense",
  "past tense forms",
  "present participle",
  "present participles",
  "past participle",
  "past participles",
  "third-person singular",
  "third-person singular forms",
  "comparative",
  "superlative",
  "alternative spelling",
  "other spellings",
  "letter name",
  "abbreviation",
];
const PARTICLES = new Set([
  "about", "across", "after", "along", "around", "at", "away", "back", "by", "down",
  "for", "in", "into", "off", "on", "out", "over", "through", "to", "together", "up", "with",
]);

function normalizeSpaces(text) {
  return text.trim().replace(/\s+/g, " ");
}

function toKey(text) {
  return normalizeSpaces(text).toLowerCase();
}

function collectMetadata(entry) {
  const values = [
    ...(entry.tags ?? []),
    ...(entry.raw_tags ?? []),
    ...(entry.categories ?? []),
  ];

  for (const sense of entry.senses ?? []) {
    values.push(...(sense.tags ?? []), ...(sense.raw_tags ?? []), ...(sense.categories ?? []));
  }

  return values
    .filter((value) => typeof value === "string")
    .map((value) => value.toLowerCase());
}

function getPrimaryGloss(entry) {
  for (const sense of entry.senses ?? []) {
    for (const gloss of sense.glosses ?? []) {
      if (typeof gloss === "string" && gloss.trim()) {
        return gloss.trim();
      }
    }
  }
  return "";
}

function getPrimaryExample(entry) {
  for (const sense of entry.senses ?? []) {
    for (const example of sense.examples ?? []) {
      if (typeof example?.text === "string" && example.text.trim()) {
        return example.text.trim();
      }
    }
  }
  return "";
}

function shouldIncludeEntry(entry) {
  if (entry.lang_code !== "en") return false;
  if (typeof entry.word !== "string") return false;
  if (!INCLUDED_POS.has(entry.pos)) return false;

  const phraseText = normalizeSpaces(entry.word);
  const isSingleWord = !/\s/.test(phraseText);

  if (isSingleWord) {
    if (!SINGLE_WORD_POS.has(entry.pos)) return false;
    if (phraseText.length < 3 || phraseText.length > 24) return false;
    if (!/^[a-z][a-z'-]*$/i.test(phraseText)) return false;
  } else {
    if (phraseText.length < 4) return false;
    if (phraseText.split(" ").length > 6) return false;
  }

  if (/\d/.test(phraseText)) return false;
  if (/[()[\]{}]/.test(phraseText)) return false;

  const metadata = collectMetadata(entry);
  if (metadata.some((value) => BANNED_MARKERS.some((marker) => value.includes(marker)))) {
    return false;
  }

  const gloss = getPrimaryGloss(entry).toLowerCase();
  if (BANNED_MARKERS.some((marker) => gloss.includes(marker))) {
    return false;
  }

  if (entry.pos === "name") return false;
  if (isSingleWord && metadata.some((value) => INFLECTION_MARKERS.some((marker) => value.includes(marker)))) {
    return false;
  }

  return Boolean(getPrimaryGloss(entry));
}

function inferPhraseType(entry, metadata, phraseText) {
  if (!/\s/.test(phraseText)) {
    return "word";
  }

  if (metadata.some((value) => value.includes("idiom") || value.includes("simile"))) {
    return "idiom";
  }

  if (entry.pos === "verb") {
    const tokens = phraseText.toLowerCase().split(" ");
    if (tokens.length >= 2 && PARTICLES.has(tokens[1])) {
      return "phrasal_verb";
    }
  }

  if (entry.pos === "intj" || entry.pos === "prep" || entry.pos === "conj" || entry.pos === "adv") {
    return "expression";
  }

  return "phrase";
}

function inferCategory(metadata, phraseText, gloss) {
  const pool = `${metadata.join(" ")} ${phraseText} ${gloss}`.toLowerCase();

  if (/(comput|internet|softwar|device|digital|server|network|protocol|keyboard|screen|phone|online|web)/.test(pool)) {
    return "Technology";
  }
  if (/(health|medical|body|exercise|hospital|disease|ill|pain|fitness|doctor|medicine)/.test(pool)) {
    return "Health";
  }
  if (/(travel|transport|airport|flight|road|car|bus|train|journey|traffic|hotel|tour)/.test(pool)) {
    return "Travel";
  }
  if (/(business|finance|market|customer|company|money|price|cost|sales)/.test(pool)) {
    return "Business";
  }
  if (/(work|office|job|career|meeting|project|manager|team|deadline)/.test(pool)) {
    return "Work";
  }
  if (/(learn|study|school|education|language|grammar|dictionary|book|write|read|teacher|student)/.test(pool)) {
    return "Learning";
  }
  if (/(emotion|feeling|happy|sad|angry|surprise|fear|calm|stress|confidence|mood)/.test(pool)) {
    return "Emotions";
  }
  if (/(friend|people|talk|conversation|polite|social|relationship|family|community)/.test(pool)) {
    return "Social";
  }

  return "Daily Life";
}

function inferDifficulty(phraseText, gloss, phraseType) {
  const tokenCount = phraseText.split(" ").length;
  const glossLength = gloss.length;

  if (phraseType === "word") {
    if (phraseText.length <= 5 && glossLength <= 100) {
      return "beginner";
    }
    if (phraseText.length >= 10 || glossLength >= 170) {
      return "advanced";
    }
    return "intermediate";
  }

  if (phraseType === "idiom" || tokenCount >= 5 || glossLength >= 160) {
    return "advanced";
  }

  if (tokenCount <= 2 && glossLength <= 95) {
    return "beginner";
  }

  return "intermediate";
}

function inferCommonness(metadata, phraseText, gloss, phraseType, difficultyLevel) {
  if (phraseType !== "word") {
    return true;
  }

  const pool = `${metadata.join(" ")} ${phraseText} ${gloss}`.toLowerCase();

  if (difficultyLevel === "advanced") {
    return false;
  }

  if (phraseText.length > 10) {
    return false;
  }

  if (
    /(chemistry|physics|astronomy|law|anatomy|taxonomy|military|aviation|mathematics|geometry|musical instruments|medicine|biology)/.test(pool)
  ) {
    return false;
  }

  if (/(scientific|technical|formal|specialized|rare|old word)/.test(pool)) {
    return false;
  }

  return true;
}

function getEntryScore(entry) {
  const typeScore = {
    idiom: 5,
    phrasal_verb: 4,
    expression: 3,
    phrase: 2,
    word: 1,
  }[entry.phraseType] ?? 0;

  return typeScore * 1000 + (entry.sourceMeaning?.length ?? 0);
}

async function buildPhraseBank() {
  const entriesByKey = new Map();
  let parsedLines = 0;

  const stream = fs.createReadStream(inputPath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    parsedLines += 1;

    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (!shouldIncludeEntry(entry)) continue;

    const phraseText = normalizeSpaces(entry.word);
    const key = toKey(phraseText);
    const metadata = collectMetadata(entry);
    const sourceMeaning = getPrimaryGloss(entry);
    const sourceExample = getPrimaryExample(entry);

    const phraseType = inferPhraseType(entry, metadata, phraseText);
    const difficultyLevel = inferDifficulty(phraseText, sourceMeaning, phraseType);

    const candidate = {
      phraseText,
      phraseType,
      category: inferCategory(metadata, phraseText, sourceMeaning),
      difficultyLevel,
      isCommon: inferCommonness(metadata, phraseText, sourceMeaning, phraseType, difficultyLevel),
      sourceMeaning,
      sourceExample,
      source: "Simple English Wiktionary",
    };

    const existing = entriesByKey.get(key);
    if (!existing || getEntryScore(candidate) > getEntryScore(existing)) {
      entriesByKey.set(key, candidate);
    }
  }

  const entries = [...entriesByKey.values()].sort((a, b) => a.phraseText.localeCompare(b.phraseText));

  const payload = {
    sourceName: path.basename(inputPath),
    sourceLabel: "Simple English Wiktionary import",
    importedAt: new Date().toISOString(),
    parsedLines,
    totalEntries: entries.length,
    entries,
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

  console.log(`Imported ${entries.length} phrase entries from ${parsedLines} lines.`);
  console.log(`Output written to ${outputPath}`);
}

buildPhraseBank().catch((error) => {
  console.error(error);
  process.exit(1);
});
