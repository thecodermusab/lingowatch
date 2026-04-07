#!/usr/bin/env node
/**
 * Import an Anki .apkg deck into the Lingowatch phrase bank.
 * Usage: node scripts/import-anki.mjs <path-to-deck.apkg>
 *
 * Handles: audio refs [sound:x.mp3], images <img>, example sentences.
 * Tested with: 4000 Essential English Words (en-en)
 */

import { execSync } from "child_process";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const apkgPath = process.argv[2];
if (!apkgPath) {
  console.error("Usage: node scripts/import-anki.mjs <path-to-deck.apkg>");
  process.exit(1);
}

const fullPath = resolve(apkgPath);
if (!existsSync(fullPath)) {
  console.error(`File not found: ${fullPath}`);
  process.exit(1);
}

// ── 1. Extract the .apkg (it's a ZIP) ──────────────────────────────────────
const tempDir = mkdtempSync(join(tmpdir(), "anki-import-"));
console.log(`Extracting ${apkgPath}...`);

try {
  execSync(`unzip -q "${fullPath}" -d "${tempDir}"`, { stdio: "pipe" });
} catch (e) {
  console.error("Failed to extract .apkg:", e.message);
  rmSync(tempDir, { recursive: true, force: true });
  process.exit(1);
}

const dbPath21 = join(tempDir, "collection.anki21");
const dbPath2  = join(tempDir, "collection.anki2");
const dbPath   = existsSync(dbPath21) ? dbPath21 : dbPath2;

if (!existsSync(dbPath)) {
  console.error("No collection database found inside the .apkg.");
  process.exit(1);
}

console.log("Reading notes...");

// ── 2. Query all notes ──────────────────────────────────────────────────────
let rawNotes;
try {
  rawNotes = execSync(
    `sqlite3 "${dbPath}" "SELECT flds, tags FROM notes;"`,
    { maxBuffer: 100 * 1024 * 1024 }
  ).toString().trim().split("\n").filter(Boolean);
} catch (e) {
  console.error("Failed to query database:", e.message);
  process.exit(1);
}

console.log(`Found ${rawNotes.length} notes. Processing...`);

// ── 3. Text cleaning helpers ────────────────────────────────────────────────
const FIELD_SEP = "\x1f";

/** Remove [sound:xxx.mp3] references entirely */
function stripAudio(str) {
  return str.replace(/\[sound:[^\]]+\]/g, "").trim();
}

/** Remove <img ...> tags entirely */
function stripImages(str) {
  return str.replace(/<img[^>]*>/gi, "").trim();
}

/** Strip HTML tags, decode basic entities */
function stripHtml(str) {
  return str
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<div>/gi, " ")
    .replace(/<\/div>/gi, " ")
    .replace(/<b>(.*?)<\/b>/gi, "$1")
    .replace(/<i>(.*?)<\/i>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Full clean: strip audio, images, then HTML */
function clean(str) {
  return stripHtml(stripImages(stripAudio(str || "")));
}

/** Returns true if a string looks like usable text (not audio/image only) */
function isUsableText(str) {
  if (!str || str.length < 3) return false;
  // After cleaning it should still have alphabetic content
  const cleaned = clean(str);
  return cleaned.length >= 3 && /[a-zA-Z]/.test(cleaned);
}

/** Returns true if a string looks like an example sentence (not a definition) */
function looksLikeExample(str) {
  // Examples tend to be longer sentences with punctuation
  return str.length > 30 && /[.!?]/.test(str);
}

function getDifficulty(tags) {
  const match = tags.match(/[Bb]ook[_\s-]?(\d)/);
  if (match) {
    const book = parseInt(match[1]);
    if (book <= 2) return "beginner";
    if (book <= 4) return "intermediate";
    return "advanced";
  }
  return "intermediate";
}

// ── 4. Parse each note ─────────────────────────────────────────────────────
const seen = new Set();
const entries = [];

for (const line of rawNotes) {
  // Last "|" separates the tags column from flds
  const lastPipe = line.lastIndexOf("|");
  const fldsPart = line.slice(0, lastPipe);
  const tagsPart = line.slice(lastPipe + 1);

  const rawFields = fldsPart.split(FIELD_SEP);
  const fields    = rawFields.map(clean);

  // Field 0 = word
  const word = fields[0]?.trim();
  if (!word || word.length === 0 || word.length > 60) continue;

  const key = word.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);

  // Find definition and example from remaining fields
  let definition = "";
  let example    = "";

  for (let i = 1; i < fields.length; i++) {
    const f = fields[i];
    if (!isUsableText(f)) continue;

    if (!definition && !looksLikeExample(f)) {
      definition = f;
    } else if (!example && looksLikeExample(f)) {
      example = f;
    }

    if (definition && example) break;
  }

  // Build sourceMeaning: definition + example if we have both
  let sourceMeaning = definition || undefined;
  if (sourceMeaning && example) {
    sourceMeaning = `${sourceMeaning}\n\nExample: ${example}`;
  } else if (!sourceMeaning && example) {
    sourceMeaning = `Example: ${example}`;
  }

  const difficulty = getDifficulty(tagsPart);
  const wordCount  = word.split(/\s+/).length;
  const phraseType = wordCount === 1 ? "word" : "phrase";

  entries.push({
    phraseText:     word,
    phraseType,
    category:       "Vocabulary",
    difficultyLevel: difficulty,
    isCommon:       difficulty === "beginner",
    sourceMeaning,
  });
}

// ── 5. Save ─────────────────────────────────────────────────────────────────
const output = {
  sourceLabel:  "4000 Essential English Words",
  totalEntries: entries.length,
  entries,
};

const outPath = resolve("extension/data/imported-phrase-bank.json");
writeFileSync(outPath, JSON.stringify(output, null, 2));

const byDiff = { beginner: 0, intermediate: 0, advanced: 0 };
for (const e of entries) byDiff[e.difficultyLevel]++;

console.log(`\n✓ Imported ${entries.length} words`);
console.log(`  Beginner:     ${byDiff.beginner}`);
console.log(`  Intermediate: ${byDiff.intermediate}`);
console.log(`  Advanced:     ${byDiff.advanced}`);
console.log(`  Saved to: ${outPath}`);

// ── 6. Cleanup ──────────────────────────────────────────────────────────────
rmSync(tempDir, { recursive: true, force: true });
console.log("\nDone!");
