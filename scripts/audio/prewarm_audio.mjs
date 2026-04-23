/**
 * One-time migration: generate and cache audio for all saved words that have no audio_url.
 *
 * Usage:
 *   node scripts/prewarm_audio.mjs
 *   node scripts/prewarm_audio.mjs --dry-run       # show words only, no audio generation
 *   node scripts/prewarm_audio.mjs --limit 50      # process at most N words
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd, env } from "node:process";
import { createHash, createHmac } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

// ── Env loading ──────────────────────────────────────────────────
const ENV_FILES = [join(cwd(), ".env"), join(cwd(), ".env.local")];
for (const envFile of ENV_FILES) {
  if (!existsSync(envFile)) continue;
  for (const rawLine of readFileSync(envFile, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
}

const isDryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit=") || a === "--limit");
const limitVal = limitArg
  ? limitArg.startsWith("--limit=")
    ? Number(limitArg.slice("--limit=".length))
    : Number(process.argv[process.argv.indexOf("--limit") + 1] || "0")
  : 0;
const limit = limitVal > 0 ? limitVal : Infinity;

// ── DB ───────────────────────────────────────────────────────────
const sql = env.DATABASE_URL ? neon(env.DATABASE_URL) : null;
if (!sql) { console.error("DATABASE_URL is not set"); process.exit(1); }

// ── Spaces config ────────────────────────────────────────────────
function getSpacesConfig() {
  const endpoint = String(env.DO_SPACES_ENDPOINT || "").replace(/\/+$/, "");
  const region = String(env.DO_SPACES_REGION || "").trim();
  const bucket = String(env.DO_SPACES_BUCKET || "").trim();
  const accessKeyId = String(env.DO_SPACES_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(env.DO_SPACES_SECRET_ACCESS_KEY || "").trim();
  const publicBaseUrl = String(env.DO_SPACES_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) return null;
  return { endpoint, region, bucket, accessKeyId, secretAccessKey, publicBaseUrl };
}
const spaces = getSpacesConfig();
if (!spaces) { console.error("DO_SPACES_* env vars are not fully set"); process.exit(1); }

// ── Polly ────────────────────────────────────────────────────────
const pollyClient = (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY)
  ? new PollyClient({
      region: env.AWS_REGION || "us-east-1",
      credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
    })
  : null;

// Google TTS
const GOOGLE_TTS_VOICE = env.GOOGLE_TTS_VOICE || "en-US-Neural2-J";
const GOOGLE_TTS_LANGUAGE = env.GOOGLE_TTS_LANGUAGE || "en-US";
const GOOGLE_TTS_RATE = Number(env.GOOGLE_TTS_SPEAKING_RATE || 0.9);
const GOOGLE_TTS_KEY = env.GOOGLE_TTS_KEY || env.GOOGLE_CLOUD_TTS_KEY || env.VITE_GOOGLE_TTS_KEY || "";

// ── Helpers ──────────────────────────────────────────────────────
function sha256(value, encoding = "hex") {
  return createHash("sha256").update(value).digest(encoding);
}
function hmac(key, value, encoding) {
  return createHmac("sha256", key).update(value).digest(encoding);
}
function createTtsCacheKey(text) {
  return sha256(JSON.stringify({
    provider: "cloud-tts",
    text: String(text || "").trim(),
    voiceName: GOOGLE_TTS_VOICE,
    languageCode: GOOGLE_TTS_LANGUAGE,
    speakingRate: GOOGLE_TTS_RATE,
    includeWordTimings: false,
  }));
}
function createTtsObjectKey(text, cacheKey) {
  const slug = String(text || "").trim().toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 64) || "audio";
  return `tts/${slug}-plain-${cacheKey.slice(0, 12)}.mp3`;
}

async function uploadToSpaces(objectKey, body) {
  const { endpoint, region, bucket, accessKeyId, secretAccessKey } = spaces;
  const host = new URL(endpoint).host;
  const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
  const url = `${endpoint}/${bucket}/${encodedKey}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const cacheControl = "public, max-age=31536000, immutable";
  const contentType = "audio/mpeg";
  const canonicalHeaderLines = [
    `cache-control:${cacheControl}`,
    `content-type:${contentType}`,
    `host:${host}`,
    "x-amz-acl:public-read",
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ];
  const signedHeaders = "cache-control;content-type;host;x-amz-acl;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", `/${bucket}/${encodedKey}`, "", canonicalHeaderLines.join("\n") + "\n", signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = hmac(signingKey, stringToSign, "hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: { Authorization: authorization, "Cache-Control": cacheControl, "Content-Type": contentType, "x-amz-acl": "public-read", "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate },
    body,
  });
  if (!response.ok) {
    const msg = await response.text().catch(() => "");
    throw new Error(`Spaces upload failed (${response.status}): ${msg.slice(0, 200)}`);
  }
}

async function synthesizeGoogleTts(text) {
  if (!GOOGLE_TTS_KEY) return null;
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: GOOGLE_TTS_LANGUAGE, name: GOOGLE_TTS_VOICE },
      audioConfig: { audioEncoding: "MP3", speakingRate: GOOGLE_TTS_RATE },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.audioContent || null;
}

async function synthesizePolly(text) {
  if (!pollyClient) return null;
  const cmd = new SynthesizeSpeechCommand({ Text: text, VoiceId: "Joanna", Engine: "standard", OutputFormat: "mp3" });
  const result = await pollyClient.send(cmd);
  if (!result.AudioStream) return null;
  const chunks = [];
  for await (const chunk of result.AudioStream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("base64");
}

async function generateAndCacheAudio(text) {
  const cacheKey = createTtsCacheKey(text);

  // Check DB cache first
  const cached = await sql`SELECT audio_url FROM tts_audio_cache WHERE cache_key = ${cacheKey} LIMIT 1`;
  if (cached?.[0]?.audio_url) return cached[0].audio_url;

  // Generate (Google primary, Polly fallback)
  let audioContent = await synthesizeGoogleTts(text);
  let provider = "google";
  if (!audioContent) {
    audioContent = await synthesizePolly(text);
    provider = "aws";
  }
  if (!audioContent) throw new Error("Both TTS providers failed");

  const audioBuffer = Buffer.from(audioContent, "base64");
  const objectKey = createTtsObjectKey(text, cacheKey);
  const audioUrl = `${spaces.publicBaseUrl}/${objectKey}`;

  await uploadToSpaces(objectKey, audioBuffer);

  await sql`
    INSERT INTO tts_audio_cache (cache_key, provider, voice_name, language_code, speaking_rate, include_word_timings, text_hash, audio_url, audio_object_key, word_timings, created_at, last_used_at)
    VALUES (${cacheKey}, ${provider}, ${GOOGLE_TTS_VOICE}, ${GOOGLE_TTS_LANGUAGE}, ${String(GOOGLE_TTS_RATE)}, false, ${sha256(text)}, ${audioUrl}, ${objectKey}, '[]', NOW(), NOW())
    ON CONFLICT (cache_key) DO UPDATE SET audio_url = EXCLUDED.audio_url, last_used_at = NOW()
  `;

  return audioUrl;
}

// ── Main ─────────────────────────────────────────────────────────
const rows = await sql`
  SELECT user_email, word, audio_url
  FROM saved_words
  WHERE audio_url IS NULL OR audio_url = ''
  ORDER BY saved_at DESC
`;

console.log(`Found ${rows.length} words without audio_url.${isDryRun ? " (dry-run)" : ""}`);

let processed = 0;
let succeeded = 0;
let failed = 0;

for (const row of rows) {
  if (processed >= limit) break;
  processed++;

  if (isDryRun) {
    console.log(`  [${processed}/${rows.length}] ${row.word}`);
    continue;
  }

  try {
    const audioUrl = await generateAndCacheAudio(row.word);
    await sql`
      UPDATE saved_words
      SET audio_url = ${audioUrl},
          phrase_data = CASE
            WHEN phrase_data IS NOT NULL
            THEN jsonb_set(phrase_data, '{audioUrl}', ${JSON.stringify(audioUrl)}::jsonb)
            ELSE phrase_data
          END
      WHERE user_email = ${row.user_email} AND word = ${row.word}
    `;
    console.log(`  ✓ [${processed}/${rows.length}] ${row.word} → ${audioUrl}`);
    succeeded++;
    // Polite rate-limiting: 200ms between requests
    await new Promise((r) => setTimeout(r, 200));
  } catch (err) {
    console.error(`  ✗ [${processed}/${rows.length}] ${row.word}: ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

if (!isDryRun) {
  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed out of ${processed} processed.`);
}
