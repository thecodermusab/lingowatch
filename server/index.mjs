import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { cwd, env } from "node:process";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import * as YoutubeTranscriptModule from "youtube-transcript/dist/youtube-transcript.esm.js";
import { neon } from "@neondatabase/serverless";
import { handlePodcastRoutes } from "./modules/podcasts.mjs";
import { handleImportedTextRoutes } from "./modules/importedTexts.mjs";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

const GCP_KEY_PATH = join(cwd(), "server", "gcp-tts-key.json");
const gcpAuth = existsSync(GCP_KEY_PATH)
  ? new GoogleAuth({ keyFile: GCP_KEY_PATH, scopes: ["https://www.googleapis.com/auth/cloud-platform"] })
  : null;

async function getTtsAccessToken() {
  if (!gcpAuth) return null;
  try {
    const client = await gcpAuth.getClient();
    const token = await client.getAccessToken();
    return token?.token ?? null;
  } catch {
    return null;
  }
}

const pollyClient = (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY)
  ? new PollyClient({
      region: env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    })
  : null;

async function synthesizeWithPolly(text, includeTimings = false) {
  if (!pollyClient) return null;
  try {
    const audioCmd = new SynthesizeSpeechCommand({
      Text: text, VoiceId: "Joanna", Engine: "standard", OutputFormat: "mp3",
    });
    const marksCmd = new SynthesizeSpeechCommand({
      Text: text, VoiceId: "Joanna", Engine: "standard",
      OutputFormat: "json", SpeechMarkTypes: ["word"],
    });

    // Run audio + speech marks in parallel to halve latency
    const [audioRes, marksRes] = await Promise.all([
      pollyClient.send(audioCmd),
      includeTimings ? pollyClient.send(marksCmd) : Promise.resolve(null),
    ]);

    if (!audioRes.AudioStream) return null;
    const chunks = [];
    for await (const chunk of audioRes.AudioStream) chunks.push(chunk);
    const audioContent = Buffer.concat(chunks).toString("base64");

    let wordTimings = [];
    if (includeTimings && marksRes?.AudioStream) {
      const marksChunks = [];
      for await (const chunk of marksRes.AudioStream) marksChunks.push(chunk);
      const marks = Buffer.concat(marksChunks).toString("utf8")
        .trim().split("\n")
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
      wordTimings = marks.map((m, i) => ({
        index: i,
        word: m.value,
        startTime: m.time / 1000,
        endTime: marks[i + 1] ? marks[i + 1].time / 1000 : m.time / 1000 + 0.4,
      }));
    }

    return { audioContent, wordTimings };
  } catch {
    return null;
  }
}

const PORT = Number(env.PORT || 3001);
const HOST = env.HOST || "0.0.0.0";
const APP_BASE_URL = env.APP_BASE_URL || "http://localhost:8080";
const ROOT_DIR = cwd();
const DIST_DIR = join(ROOT_DIR, "dist");
const ENV_FILES = [join(ROOT_DIR, ".env"), join(ROOT_DIR, ".env.local")];
const DATA_DIR = join(ROOT_DIR, "server", "data");
const INBOX_FILE = join(DATA_DIR, "inbox-captures.json");
const EXT_PHRASES_FILE = join(DATA_DIR, "ext-saved-phrases.json");
const WORLD_STORIES_FILE = join(DATA_DIR, "world-stories.json");
const YOUTUBE_CHANNEL_SEEDS_FILE = join(DATA_DIR, "youtube-channel-seeds.txt");
const CHANNEL_THUMBNAILS_FILE = join(DATA_DIR, "channel-thumbnails.json");
const CHANNEL_THUMBNAIL_TTL_MS = 20 * 24 * 60 * 60 * 1000; // 20 days
const LEGACY_OWNER_EMAIL = "maahir.engineer@gmail.com";
const EMAIL_TEMPLATES_DIR = join(ROOT_DIR, "server", "email-templates");

loadEnvFile();

const AI_REQUEST_TIMEOUT_MS = Number(env.AI_REQUEST_TIMEOUT_MS || 20000);
const TTS_REQUEST_TIMEOUT_MS = Number(env.TTS_REQUEST_TIMEOUT_MS || 5000);

const sql = env.DATABASE_URL ? neon(env.DATABASE_URL) : null;
const googleOAuthClientId = env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || "";
const googleOAuthClient = googleOAuthClientId ? new OAuth2Client(googleOAuthClientId) : null;
const ttsGenerationJobs = new Map();

// ── Rate limiting for AI endpoints ──────────────────────────────────────────
const RATE_LIMIT_RPM = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const OWNER_EMAIL = "maahir.engineer@gmail.com";
const rateLimitMap = new Map(); // ip -> { count, windowStart }

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) rateLimitMap.delete(ip);
  }
}, 5 * 60 * 1000);

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

async function checkAiRateLimit(req) {
  const ip = getClientIp(req);
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return true;

  const authClaim = await validateSessionToken(req).catch(() => null);
  if (authClaim?.email === OWNER_EMAIL) return true;

  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_RPM) return false;
  entry.count++;
  return true;
}

// Run schema migrations
if (sql) {
  void ensureAuthUsersSchema();
  void ensurePasswordResetTokensSchema();
  void ensureEmailVerificationTokensSchema();
  void ensureSavedWordsSchema();
  void ensureTtsAudioCacheSchema();
}

const SYSTEM_PROMPT = `
You are a bilingual English-Somali vocabulary coach for Somali speakers learning English.
Return only valid JSON, no markdown, no code fences.

Return one JSON object with this exact shape:
{
  "phraseType": "word | phrase | phrasal_verb | idiom | expression",
  "standardMeaning": "string",
  "easyMeaning": "string",
  "aiExplanation": "string",
  "usageContext": "string",
  "examples": [
    { "type": "simple | daily | work | extra | somali", "text": "string", "translation": "string" }
  ],
  "somaliMeaning": "string",
  "partOfSpeech": "string",
  "somaliExplanation": "string",
  "somaliSentence": "string",
  "somaliSentenceTranslation": "string",
  "usageNote": "string",
  "contextNote": "string",
  "commonMistake": "string",
  "pronunciationText": "string",
  "relatedPhrases": ["string", "string", "string"]
}

Field rules:
- phraseType: pick the most accurate type from the options.
- standardMeaning: dictionary-style definition in clear English, 1-2 sentences.
- easyMeaning: explain it like the learner is 12 years old, 1 sentence.
- aiExplanation: 3-4 learner-friendly sentences. If subtitle context is provided, explain that specific use. If no subtitle context is provided, explain the word/phrase generally and do not mention subtitles, videos, speakers, scenes, "here", or "in this sentence".
- usageContext: 2-3 sentences describing when people commonly use this word/phrase, the tone/register, and a natural situation where it fits.
- examples: 3 to 5 items. Each must have "type", "text", and "translation".
- If a Google Somali translation hint is provided in the user prompt, treat it as a grounding hint for the intended Somali sense. Keep somaliMeaning and somaliExplanation aligned with that sense unless the hint is clearly wrong for the context.
- For English examples, "translation" must be a natural Somali translation.
- For type "somali", "text" must be a natural Somali sentence and "translation" must be the English meaning.
- somaliMeaning: short natural Somali translation, 1-5 words. Prefer common everyday Somali over formal or Arabic-borrowed terms where both exist. If the word has a few very close everyday Somali meanings, you may return 2-4 short glosses separated by commas.
- partOfSpeech: one of noun, verb, adjective, adverb, phrase, idiom, conjunction, preposition.
- somaliExplanation: 2-3 sentences in simple Somali explaining the meaning, when to use it, and one grammar note if relevant.
- somaliSentence: one natural Somali example sentence using the word in the same sense as the subtitle context.
- somaliSentenceTranslation: English translation of somaliSentence.
- usageNote: one short Somali sentence about register.
- contextNote: write 2-3 sentences in simple English, spoken like a friendly coach talking directly to the learner. If subtitle context is provided, explain the specific sense. If no subtitle context is provided, give a general learner note and do not mention subtitles, videos, speakers, scenes, "here", or "in this sentence".
- commonMistake: 2-3 sentences describing the most common error Somali speakers make with this word or phrase, why it sounds wrong, and what to say instead.
- pronunciationText: write using simple English respelling only, e.g. "bih-HAYV" or "EK-struh". Do not use IPA symbols.
- relatedPhrases: exactly 3 related English words or phrases, as plain strings.
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

const EXTENSION_SOMALI_SUPPORT_SYSTEM_PROMPT = `
You are a Somali language expert helping learners understand the best Somali meaning for an English word.
Return only valid JSON, no markdown, no code fences.

Return one JSON object with this exact shape:
{
  "somaliMeaning": "string",
  "partOfSpeech": "string",
  "somaliExplanation": "string",
  "usageNote": "string",
  "somaliSentence": "string",
  "sentenceTranslation": "string",
  "contextNote": "string"
}

Field rules:
- somaliMeaning: short, natural Somali translation (1-5 words). Prefer common everyday Somali over formal or Arabic-borrowed terms where both exist.
- partOfSpeech: one of noun, verb, adjective, adverb, phrase, idiom, conjunction, preposition.
- somaliExplanation: 2-3 sentences in simple Somali explaining the meaning, when to use it, and any important grammar note.
- usageNote: one short Somali sentence noting register, for example "Waa ereyga caadiga ah", "Waxaa loo isticmaalaa hadal rasmiga ah", or "Dhallinyaradu badanaa way isticmaalaan".
- somaliSentence: one natural example sentence in Somali using the word in the selected sense.
- sentenceTranslation: English translation of somaliSentence.
- contextNote: one Somali sentence explaining which specific sense you chose and why. If no subtitle context is provided, do not mention subtitles, videos, speakers, scenes, or missing context.
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
  { type: "simple", text: "Here is a simple example sentence.", translation: "Waa jumlad tusaale fudud ah." },
  { type: "daily", text: "Here is a daily life example.", translation: "Waa tusaale nolol maalmeed ah." },
  { type: "work", text: "Here is a work example.", translation: "Waa tusaale shaqo ah." },
];

function normalizeAuthEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeFullName(value, email = "") {
  const fallback = String(email || "").split("@")[0] || "Learner";
  return String(value || "").trim() || fallback;
}

function defaultAuthProfile(overrides = {}) {
  return {
    preferredLanguage: "somali",
    englishLevel: "beginner",
    somaliModeEnabled: true,
    autoPlayAudioEnabled: false,
    preferredAiProvider: "auto",
    onboardingCompleted: false,
    ...overrides,
  };
}

function escapeEmailHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtmlTemplateFromFile(fileName, replacements = {}) {
  const filePath = join(EMAIL_TEMPLATES_DIR, fileName);
  let html = readFileSync(filePath, "utf8");

  for (const [key, rawValue] of Object.entries(replacements)) {
    const value = String(rawValue ?? "");
    html = html.replace(new RegExp(`{{\\s*${key}\\s*}}`, "g"), value);
  }

  return html;
}

function buildEmailTemplateHtml(kind, values = {}) {
  if (kind === "reset") {
    const resetUrl = String(values.resetUrl || `${APP_BASE_URL}/reset-password?token=preview-token`);
    const supportEmail = String(values.supportEmail || "hello@finalproject.app");
    return renderHtmlTemplateFromFile("forgot-password.html", {})
      .replace(/Hello Katie,/g, `Hello ${escapeEmailHtml(values.recipientName || "LingoWatch learner")},`)
      .replace(/href="#"/, `href="${escapeEmailHtml(resetUrl)}"`)
      .replace(/href="#"/, `href="mailto:${escapeEmailHtml(supportEmail)}"`)
      .replace(/href="#"/g, `href="${escapeEmailHtml(APP_BASE_URL)}"`)
      .replace(/30 minutes/g, String(values.expiresInMinutes || 30))
      .replace(/support team\./g, `support team.`)
      .replace(/support<\/a>/g, `${escapeEmailHtml(supportEmail)}</a>`);
  }

  if (kind === "welcome") {
    const dashboardUrl = String(values.ctaUrl || `${APP_BASE_URL}/dashboard`);
    const supportEmail = String(values.supportEmail || "hello@finalproject.app");
    return renderHtmlTemplateFromFile("welcome-email.html", {})
      .replace(/Hello Katie,/g, `Hello ${escapeEmailHtml(values.recipientName || "LingoWatch learner")},`)
      .replace(/href="#"/, `href="${escapeEmailHtml(dashboardUrl)}"`)
      .replace(/support@lingowatch\.com/g, escapeEmailHtml(supportEmail))
      .replace(/href="#"/g, `href="${escapeEmailHtml(APP_BASE_URL)}"`);
  }

  if (kind === "verify") {
    const verifyUrl = String(values.verifyUrl || `${APP_BASE_URL}/verify-email?token=preview-token`);
    const supportEmail = String(values.supportEmail || "hello@finalproject.app");
    return renderHtmlTemplateFromFile("verify-email.html", {})
      .replace(/Hello Katie,/g, `Hello ${escapeEmailHtml(values.recipientName || "LingoWatch learner")},`)
      .replace(/Thank you for choosing LingoWatch, Katie!/g, `Thank you for choosing LingoWatch, ${escapeEmailHtml(values.recipientName || "LingoWatch learner")}!`)
      .replace(/href="#"/, `href="${escapeEmailHtml(verifyUrl)}"`)
      .replace(/support@lingowatch\.com/g, escapeEmailHtml(supportEmail))
      .replace(/48 hours/g, String(values.expiresInHours || 48) + " hours")
      .replace(/href="#"/g, `href="${escapeEmailHtml(APP_BASE_URL)}"`);
  }

  const ctaUrl = String(values.ctaUrl || `${APP_BASE_URL}/dashboard`);
  const bullets = Array.isArray(values.bullets) ? values.bullets : [];
  return renderHtmlTemplateFromFile("announcement-email.html", {})
    .replace(/New learning features are here!/g, escapeEmailHtml(values.headline || "A better way to learn with LingoWatch"))
    .replace(/Hi Katie,/g, `Hi ${escapeEmailHtml(values.recipientName || "LingoWatch learner")},`)
    .replace(/We've been working hard to make your language learning journey even more effective\. Today, we're thrilled to announce a few exciting additions to your toolkit that will help you practice better\./g, escapeEmailHtml(values.intro || "We shipped a cleaner, faster experience for your saved words, stories, and listening tools."))
    .replace(/Interactive Stories/g, escapeEmailHtml(bullets[0] || "Interactive Stories"))
    .replace(/Enhanced Listening Mode/g, escapeEmailHtml(bullets[1] || "Enhanced Listening Mode"))
    .replace(/Smarter Vocabulary Reviews/g, escapeEmailHtml(bullets[2] || "Smarter Vocabulary Reviews"))
    .replace(/Dive into real-world conversations and build context naturally\./g, "")
    .replace(/Fine-tune your ear with new audio exercises focused on tricky pronunciations\./g, "")
    .replace(/Our spaced repetition system is now better at targeting words you struggle with\./g, "")
    .replace(/CHECK IT OUT/g, escapeEmailHtml(values.ctaLabel || "Open LingoWatch"))
    .replace(/href="#"/, `href="${escapeEmailHtml(ctaUrl)}"`)
    .replace(/href="#"/g, `href="${escapeEmailHtml(APP_BASE_URL)}"`);
}

function getEmailConfig() {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  const fromDefault = String(env.EMAIL_FROM || "").trim();
  const fromAuth = String(env.EMAIL_FROM_AUTH || fromDefault).trim();
  const fromUpdates = String(env.EMAIL_FROM_UPDATES || fromDefault).trim();
  const replyTo = String(env.EMAIL_REPLY_TO || "").trim();
  const appBaseUrl = String(env.APP_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
  const announcementAdminKey = String(env.ADMIN_ANNOUNCEMENT_KEY || "").trim();
  const missing = [];
  if (!apiKey) missing.push("RESEND_API_KEY");
  if (!fromAuth) missing.push("EMAIL_FROM_AUTH or EMAIL_FROM");
  if (!fromUpdates) missing.push("EMAIL_FROM_UPDATES or EMAIL_FROM");

  if (missing.length) {
    return { configured: false, missing, apiKey, fromDefault, fromAuth, fromUpdates, replyTo, appBaseUrl, announcementAdminKey };
  }

  return {
    configured: true,
    missing,
    apiKey,
    fromDefault,
    fromAuth,
    fromUpdates,
    replyTo,
    appBaseUrl,
    announcementAdminKey,
  };
}

async function sendResendEmail({ from, to, subject, html, replyTo = "", tags = [] }) {
  const emailConfig = getEmailConfig();
  if (!emailConfig.configured) {
    throw new Error(`Email is not configured: ${emailConfig.missing.join(", ")}`);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${emailConfig.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(tags.length ? { tags } : {}),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Resend send failed (${response.status})`);
  }

  return data;
}

async function sendPasswordResetEmail({ email, fullName, token }) {
  const emailConfig = getEmailConfig();
  if (!emailConfig.configured) throw new Error(`Email is not configured: ${emailConfig.missing.join(", ")}`);

  const resetUrl = `${emailConfig.appBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const html = buildEmailTemplateHtml("reset", {
    recipientName: fullName || email,
    resetUrl,
    expiresInMinutes: 30,
    supportEmail: emailConfig.replyTo || emailConfig.fromAuth.match(/<([^>]+)>/)?.[1] || "",
  });

  return sendResendEmail({
    from: emailConfig.fromAuth,
    to: email,
    subject: "Reset your LingoWatch password",
    html,
    replyTo: emailConfig.replyTo,
    tags: [
      { name: "type", value: "password-reset" },
    ],
  });
}

async function sendWelcomeEmail({ email, fullName }) {
  const emailConfig = getEmailConfig();
  if (!emailConfig.configured) throw new Error(`Email is not configured: ${emailConfig.missing.join(", ")}`);

  const html = buildEmailTemplateHtml("welcome", {
    recipientName: fullName || email,
    ctaUrl: `${emailConfig.appBaseUrl}/dashboard`,
    supportEmail: emailConfig.replyTo || emailConfig.fromUpdates.match(/<([^>]+)>/)?.[1] || "",
  });

  return sendResendEmail({
    from: emailConfig.fromUpdates,
    to: email,
    subject: "Welcome to LingoWatch",
    html,
    replyTo: emailConfig.replyTo,
    tags: [
      { name: "type", value: "welcome" },
    ],
  });
}

async function sendVerificationEmail({ email, fullName, token }) {
  const emailConfig = getEmailConfig();
  if (!emailConfig.configured) throw new Error(`Email is not configured: ${emailConfig.missing.join(", ")}`);

  const verifyUrl = `${emailConfig.appBaseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  const html = buildEmailTemplateHtml("verify", {
    recipientName: fullName || email,
    verifyUrl,
    expiresInHours: 48,
    supportEmail: emailConfig.replyTo || emailConfig.fromAuth.match(/<([^>]+)>/)?.[1] || "",
  });

  return sendResendEmail({
    from: emailConfig.fromAuth,
    to: email,
    subject: "Verify your LingoWatch email address",
    html,
    replyTo: emailConfig.replyTo,
    tags: [
      { name: "type", value: "email-verification" },
    ],
  });
}

async function sendAnnouncementEmails({ subject, headline, intro, bullets, ctaLabel, ctaUrl }) {
  if (!sql) throw new Error("Database not configured");
  const emailConfig = getEmailConfig();
  if (!emailConfig.configured) throw new Error(`Email is not configured: ${emailConfig.missing.join(", ")}`);

  const rows = await sql`
    SELECT DISTINCT email, full_name
    FROM auth_users
    WHERE email IS NOT NULL AND email <> ''
    ORDER BY email ASC
  `;

  const recipients = rows
    .map((row) => ({ email: normalizeAuthEmail(row.email), fullName: row.full_name || "Learner" }))
    .filter((row) => row.email);

  const results = [];
  for (const recipient of recipients) {
    const html = buildEmailTemplateHtml("announcement", {
      recipientName: recipient.fullName,
      headline,
      intro,
      bullets,
      ctaLabel,
      ctaUrl,
    });

    results.push(
      sendResendEmail({
        from: emailConfig.fromUpdates,
        to: recipient.email,
        subject,
        html,
        replyTo: emailConfig.replyTo,
        tags: [
          { name: "type", value: "announcement" },
        ],
      })
    );
  }

  const settled = await Promise.allSettled(results);
  const sent = settled.filter((result) => result.status === "fulfilled").length;
  const failed = settled.length - sent;
  return { total: settled.length, sent, failed };
}

function createPasswordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPasswordHash(password, storedHash) {
  const raw = String(storedHash || "");
  const [salt, hash] = raw.split(":");
  if (!salt || !hash) return false;

  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

function buildAuthResponse(user, sessionToken = "") {
  const profile = defaultAuthProfile(user?.profile || {});
  const createdAt = user?.first_login_at
    ? new Date(user.first_login_at).toISOString()
    : new Date().toISOString();
  const lastLoginAt = user?.last_login_at
    ? new Date(user.last_login_at).toISOString()
    : createdAt;

  return {
    user: {
      id: user.id,
      fullName: user.full_name || "Learner",
      email: user.email,
      pictureUrl: user.picture_url || "",
      preferredLanguage: profile.preferredLanguage,
      englishLevel: profile.englishLevel,
      somaliModeEnabled: Boolean(profile.somaliModeEnabled),
      autoPlayAudioEnabled: Boolean(profile.autoPlayAudioEnabled),
      preferredAiProvider: profile.preferredAiProvider || "auto",
      onboardingCompleted: Boolean(user.onboarding_completed ?? profile.onboardingCompleted),
      emailVerified: Boolean(user.email_verified),
      createdAt,
    },
    login: {
      lastLoginAt,
      loginCount: Number(user.login_count || 1),
    },
    sessionToken: sessionToken || undefined,
  };
}

createServer(async (req, res) => {
  setCorsHeaders(res);
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/google") {
    try {
      if (!sql) {
        sendJson(res, 503, { error: "Database not configured" });
        return;
      }

      if (!googleOAuthClient || !googleOAuthClientId) {
        sendJson(res, 503, { error: "Google auth is not configured" });
        return;
      }

      await ensureAuthUsersSchema();
      await ensureEmailVerificationTokensSchema();
      const body = await readJsonBody(req);
      const credential = String(body?.credential || "").trim();

      if (!credential) {
        sendJson(res, 400, { error: "Google credential is required" });
        return;
      }

      const ticket = await googleOAuthClient.verifyIdToken({
        idToken: credential,
        audience: googleOAuthClientId,
      });
      const payload = ticket.getPayload();
      const googleSub = String(payload?.sub || "").trim();
      const email = normalizeAuthEmail(payload?.email);

      if (!googleSub || !email || payload?.email_verified !== true) {
        sendJson(res, 401, { error: "Google account could not be verified" });
        return;
      }

      const fullName = normalizeFullName(payload?.name, email);
      const pictureUrl = String(payload?.picture || "").trim();
      const now = new Date().toISOString();
      const profile = defaultAuthProfile({
        googleSub,
        locale: payload?.locale || "",
      });

      const rows = await sql`
        INSERT INTO auth_users (
          id,
          google_sub,
          email,
          full_name,
          picture_url,
          profile,
          email_verified,
          auth_provider,
          onboarding_completed,
          login_count,
          first_login_at,
          last_login_at
        )
        VALUES (
          ${crypto.randomUUID()},
          ${googleSub},
          ${email},
          ${fullName},
          ${pictureUrl},
          ${profile},
          ${true},
          ${"google"},
          ${false},
          1,
          ${now},
          ${now}
        )
        ON CONFLICT (email) DO UPDATE SET
          google_sub = EXCLUDED.google_sub,
          email = EXCLUDED.email,
          full_name = EXCLUDED.full_name,
          picture_url = EXCLUDED.picture_url,
          profile = EXCLUDED.profile,
          email_verified = TRUE,
          auth_provider = CASE
            WHEN auth_users.auth_provider = 'password' THEN 'google+password'
            ELSE 'google'
          END,
          login_count = auth_users.login_count + 1,
          last_login_at = EXCLUDED.last_login_at
        RETURNING id, email, full_name, picture_url, profile, email_verified, onboarding_completed, first_login_at, last_login_at, login_count
      `;

      const user = rows[0];
      const sessionToken = await issueSessionToken(user.id);
      sendJson(res, 200, buildAuthResponse(user, sessionToken));
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google login failed";
      sendJson(res, 401, { error: message });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/auth/signup") {
    try {
      if (!sql) {
        sendJson(res, 503, { error: "Database not configured" });
        return;
      }

      await ensureAuthUsersSchema();
      const body = await readJsonBody(req);
      const email = normalizeAuthEmail(body?.email);
      const password = String(body?.password || "");
      const fullName = normalizeFullName(body?.fullName, email);

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sendJson(res, 400, { error: "Please enter a valid email address." });
        return;
      }

      if (password.length < 8) {
        sendJson(res, 400, { error: "Password must be at least 8 characters." });
        return;
      }

      const existing = await sql`
        SELECT id
        FROM auth_users
        WHERE email = ${email}
        LIMIT 1
      `;

      if (existing.length) {
        sendJson(res, 409, { error: "An account with this email already exists." });
        return;
      }

      const now = new Date().toISOString();
      const profile = defaultAuthProfile();
      const passwordHash = createPasswordHash(password);
      const rows = await sql`
        INSERT INTO auth_users (
          id,
          google_sub,
          email,
          full_name,
          picture_url,
          profile,
          password_hash,
          email_verified,
          auth_provider,
          onboarding_completed,
          login_count,
          first_login_at,
          last_login_at
        )
        VALUES (
          ${crypto.randomUUID()},
          ${null},
          ${email},
          ${fullName},
          ${""},
          ${profile},
          ${passwordHash},
          ${false},
          ${"password"},
          ${false},
          1,
          ${now},
          ${now}
        )
        RETURNING id, email, full_name, picture_url, profile, email_verified, onboarding_completed, first_login_at, last_login_at, login_count
      `;

      const createdUser = rows[0];
      const rawVerificationToken = randomBytes(32).toString("hex");
      const verificationTokenHash = sha256(rawVerificationToken);
      const verificationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      await sql`DELETE FROM email_verification_tokens WHERE user_id = ${createdUser.id} OR expires_at < NOW()`;
      await sql`
        INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
        VALUES (${crypto.randomUUID()}, ${createdUser.id}, ${verificationTokenHash}, ${verificationExpiresAt})
      `;

      void Promise.allSettled([
        sendWelcomeEmail({
          email: createdUser.email,
          fullName: createdUser.full_name,
        }),
        sendVerificationEmail({
          email: createdUser.email,
          fullName: createdUser.full_name,
          token: rawVerificationToken,
        }),
      ]).then((results) => {
        results.forEach((result) => {
          if (result.status === "rejected") {
            console.warn("Could not send signup email:", result.reason);
          }
        });
      });

      const sessionToken = await issueSessionToken(createdUser.id);
      sendJson(res, 200, buildAuthResponse(createdUser, sessionToken));
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign up failed";
      sendJson(res, 400, { error: message });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    try {
      if (!sql) {
        sendJson(res, 503, { error: "Database not configured" });
        return;
      }

      await ensureAuthUsersSchema();
      const body = await readJsonBody(req);
      const email = normalizeAuthEmail(body?.email);
      const password = String(body?.password || "");

      if (!email || !password) {
        sendJson(res, 400, { error: "Email and password are required." });
        return;
      }

      const rows = await sql`
        SELECT id, email, full_name, picture_url, profile, password_hash, email_verified, onboarding_completed, first_login_at, last_login_at, login_count
        FROM auth_users
        WHERE email = ${email}
        LIMIT 1
      `;

      const user = rows[0];
      if (!user?.password_hash || !verifyPasswordHash(password, user.password_hash)) {
        sendJson(res, 401, { error: "Incorrect email or password." });
        return;
      }

      const now = new Date().toISOString();
      const updatedRows = await sql`
        UPDATE auth_users
        SET login_count = login_count + 1,
            last_login_at = ${now}
        WHERE id = ${user.id}
        RETURNING id, email, full_name, picture_url, profile, email_verified, onboarding_completed, first_login_at, last_login_at, login_count
      `;

      const sessionToken = await issueSessionToken(updatedRows[0].id);
      sendJson(res, 200, buildAuthResponse(updatedRows[0], sessionToken));
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      sendJson(res, 400, { error: message });
      return;
    }
  }

  if (req.method === "PATCH" && pathname === "/api/auth/profile") {
    try {
      if (!sql) {
        sendJson(res, 503, { error: "Database not configured" });
        return;
      }

      await ensureAuthUsersSchema();
      const body = await readJsonBody(req);
      const userId = String(body?.userId || "").trim();
      const fullName = String(body?.fullName || "").trim();
      const updates = typeof body?.updates === "object" && body?.updates ? body.updates : {};

      if (!userId) {
        sendJson(res, 400, { error: "User id is required." });
        return;
      }

      const rows = await sql`
        SELECT id, email, full_name, picture_url, profile, email_verified, onboarding_completed, first_login_at, last_login_at, login_count
        FROM auth_users
        WHERE id = ${userId}
        LIMIT 1
      `;

      const existing = rows[0];
      if (!existing) {
        sendJson(res, 404, { error: "User not found." });
        return;
      }

      const nextProfile = {
        ...defaultAuthProfile(existing.profile || {}),
        ...updates,
      };
      const onboardingCompleted = Boolean(body?.onboardingCompleted ?? updates?.onboardingCompleted ?? existing.onboarding_completed);
      const updated = await sql`
        UPDATE auth_users
        SET full_name = ${fullName || existing.full_name},
            profile = ${nextProfile},
            onboarding_completed = ${onboardingCompleted}
        WHERE id = ${userId}
        RETURNING id, email, full_name, picture_url, profile, email_verified, onboarding_completed, first_login_at, last_login_at, login_count
      `;

      sendJson(res, 200, buildAuthResponse(updated[0]));
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Profile update failed";
      sendJson(res, 400, { error: message });
      return;
    }
  }

  if (req.method === "GET" && pathname === "/api/email-preview") {
    const template = String(url.searchParams.get("template") || "reset").trim();
    const html = buildEmailTemplateHtml(template, {
      recipientName: "LingoWatch learner",
      resetUrl: `${APP_BASE_URL}/reset-password?token=preview-token`,
      verifyUrl: `${APP_BASE_URL}/verify-email?token=preview-token`,
      expiresInMinutes: 30,
      expiresInHours: 48,
      ctaUrl: `${APP_BASE_URL}/dashboard`,
      ctaLabel: "See what changed",
      supportEmail: "hello@finalproject.app",
      headline: "Your reading and audio experience just got smoother",
      intro: "We redesigned several parts of LingoWatch so saved words, stories, and books feel faster and cleaner.",
      bullets: [
        "Saved word audio now prepares in the background",
        "Stories reopen faster with cached browser cards",
        "Book listening controls are more reliable row by row",
      ],
    });

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/announcements/config") {
    const emailConfig = getEmailConfig();
    sendJson(res, 200, {
      configured: Boolean(emailConfig.configured),
      missing: emailConfig.missing || [],
      defaultCtaUrl: `${emailConfig.appBaseUrl}/dashboard`,
      adminEmail: LEGACY_OWNER_EMAIL,
      requiresAdminKey: Boolean(emailConfig.announcementAdminKey),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/forgot-password") {
    try {
      if (!sql) {
        sendJson(res, 503, { error: "Database not configured" });
        return;
      }

      await ensureAuthUsersSchema();
      await ensurePasswordResetTokensSchema();
      const body = await readJsonBody(req);
      const email = normalizeAuthEmail(body?.email);

      if (!email) {
        sendJson(res, 200, {
          ok: true,
          message: "If an account exists for that email, a reset link has been sent.",
        });
        return;
      }

      const rows = await sql`
        SELECT id, email, full_name
        FROM auth_users
        WHERE email = ${email}
        LIMIT 1
      `;

      const user = rows[0];
      if (user) {
        const rawToken = randomBytes(32).toString("hex");
        const tokenHash = sha256(rawToken);
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

        await sql`DELETE FROM password_reset_tokens WHERE user_id = ${user.id} OR expires_at < NOW()`;
        await sql`
          INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
          VALUES (${crypto.randomUUID()}, ${user.id}, ${tokenHash}, ${expiresAt})
        `;

        await sendPasswordResetEmail({
          email: user.email,
          fullName: user.full_name,
          token: rawToken,
        });
      }

      sendJson(res, 200, {
        ok: true,
        message: "If an account exists for that email, a reset link has been sent.",
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Forgot password failed";
      sendJson(res, 400, { error: message });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/auth/reset-password") {
    try {
      if (!sql) {
        sendJson(res, 503, { error: "Database not configured" });
        return;
      }

      await ensureAuthUsersSchema();
      await ensurePasswordResetTokensSchema();
      const body = await readJsonBody(req);
      const token = String(body?.token || "").trim();
      const password = String(body?.password || "");

      if (!token || password.length < 8) {
        sendJson(res, 400, { error: "Token and a password of at least 8 characters are required." });
        return;
      }

      const tokenHash = sha256(token);
      const rows = await sql`
        SELECT id, user_id
        FROM password_reset_tokens
        WHERE token_hash = ${tokenHash}
          AND used_at IS NULL
          AND expires_at > NOW()
        LIMIT 1
      `;

      const resetToken = rows[0];
      if (!resetToken) {
        sendJson(res, 400, { error: "This reset link is invalid or has expired." });
        return;
      }

      const passwordHash = createPasswordHash(password);
      await sql`
        UPDATE auth_users
        SET password_hash = ${passwordHash},
            auth_provider = CASE
              WHEN auth_provider = 'google' THEN 'google+password'
              ELSE 'password'
            END
        WHERE id = ${resetToken.user_id}
      `;
      await sql`
        UPDATE password_reset_tokens
        SET used_at = NOW()
        WHERE id = ${resetToken.id}
      `;

      sendJson(res, 200, { ok: true });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Password reset failed";
      sendJson(res, 400, { error: message });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/auth/verify-email") {
    try {
      if (!sql) {
        sendJson(res, 503, { error: "Database not configured" });
        return;
      }

      await ensureAuthUsersSchema();
      await ensureEmailVerificationTokensSchema();
      const body = await readJsonBody(req);
      const token = String(body?.token || "").trim();

      if (!token) {
        sendJson(res, 400, { error: "Verification token is required." });
        return;
      }

      const tokenHash = sha256(token);
      const rows = await sql`
        SELECT id, user_id, expires_at, used_at
        FROM email_verification_tokens
        WHERE token_hash = ${tokenHash}
        LIMIT 1
      `;

      const verificationToken = rows[0];
      if (!verificationToken || verificationToken.used_at || new Date(verificationToken.expires_at).getTime() < Date.now()) {
        sendJson(res, 400, { error: "This verification link is invalid or has expired." });
        return;
      }

      const updatedUsers = await sql`
        UPDATE auth_users
        SET email_verified = TRUE
        WHERE id = ${verificationToken.user_id}
        RETURNING id, email, full_name, picture_url, profile, email_verified, onboarding_completed, first_login_at, last_login_at, login_count
      `;

      await sql`
        UPDATE email_verification_tokens
        SET used_at = NOW()
        WHERE id = ${verificationToken.id}
      `;

      sendJson(res, 200, {
        ok: true,
        user: buildAuthResponse(updatedUsers[0]).user,
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email verification failed";
      sendJson(res, 400, { error: message });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/admin/announcements/send") {
    try {
      const emailConfig = getEmailConfig();
      if (!emailConfig.configured) {
        sendJson(res, 503, { error: `Announcement sending is not configured: ${emailConfig.missing.join(", ")}` });
        return;
      }

      const body = await readJsonBody(req);
      const adminKey = String(req.headers["x-admin-key"] || "").trim();
      const requestedByEmail = normalizeAuthEmail(body?.requestedByEmail);
      const adminAuthorizedByEmail = requestedByEmail === LEGACY_OWNER_EMAIL;
      const adminAuthorizedByKey = emailConfig.announcementAdminKey
        ? adminKey === emailConfig.announcementAdminKey
        : false;

      if (!adminAuthorizedByEmail && !adminAuthorizedByKey) {
        sendJson(res, 403, { error: "Forbidden" });
        return;
      }

      const subject = String(body?.subject || "").trim();
      const headline = String(body?.headline || "").trim();
      const intro = String(body?.intro || "").trim();
      const ctaLabel = String(body?.ctaLabel || "Open LingoWatch").trim();
      const ctaUrl = String(body?.ctaUrl || `${emailConfig.appBaseUrl}/dashboard`).trim();
      const bullets = Array.isArray(body?.bullets)
        ? body.bullets.map((item) => String(item || "").trim()).filter(Boolean)
        : [];

      if (!subject || !headline || !intro || !bullets.length) {
        sendJson(res, 400, { error: "subject, headline, intro, and at least one bullet are required." });
        return;
      }

      const result = await sendAnnouncementEmails({
        subject,
        headline,
        intro,
        bullets,
        ctaLabel,
        ctaUrl,
      });

      sendJson(res, 200, { ok: true, ...result });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Announcement send failed";
      sendJson(res, 400, { error: message });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/ai/explain") {
    try {
      if (!await checkAiRateLimit(req)) {
        sendJson(res, 429, { error: "Too many requests. Please slow down and try again in a minute." });
        return;
      }
      const body = await readJsonBody(req);
      const phraseText = String(body?.phraseText || "").trim();
      const sentenceContext = String(body?.sentenceContext || "").trim();
      const googleTranslation = String(body?.googleTranslation || "").trim();
      const preferredProvider = normalizePreferredProvider(body?.preferredProvider);
      const strictProvider = Boolean(body?.strictProvider);

      if (!phraseText) {
        sendJson(res, 400, { error: "phraseText is required" });
        return;
      }

      const aiResult = await explainPhrase(phraseText, preferredProvider, sentenceContext, strictProvider, googleTranslation);
      sendJson(res, 200, aiResult);

      // Pre-warm audio cache for the word itself and its 3 core example sentences
      void getOrGenerateAudioUrl(phraseText).catch(() => {});
      const coreTypes = new Set(["simple", "daily", "work"]);
      for (const ex of (Array.isArray(aiResult?.examples) ? aiResult.examples : [])) {
        if (coreTypes.has(ex?.type) && ex?.text) {
          void getOrGenerateAudioUrl(ex.text).catch(() => {});
        }
      }
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected server error";
      sendJson(res, 500, { error: message });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/ai/story") {
    try {
      if (!await checkAiRateLimit(req)) {
        sendJson(res, 429, { error: "Too many requests. Please slow down and try again in a minute." });
        return;
      }
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
        ["glm4", "deepseek", "gemini-lite", "gemini", "grok", "openrouter", "cerebras", "antigravity"].map((provider) => testSingleProvider(provider))
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

      if (preferredProvider && preferredProvider !== "auto") {
        await requestJsonFromSingleProvider({
          provider: preferredProvider,
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: "Phrase: break the ice",
        });
      } else {
        await explainPhrase("break the ice", preferredProvider);
      }
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
      const userEmail = normalizeOwnerEmail(url.searchParams.get("userEmail") || url.searchParams.get("email"));
      const data = existsSync(EXT_PHRASES_FILE) ? JSON.parse(readFileSync(EXT_PHRASES_FILE, "utf8")) : [];
      const filtered = userEmail
        ? data.filter((phrase) => normalizeOwnerEmail(phrase?.userEmail || phrase?.email || LEGACY_OWNER_EMAIL) === userEmail)
        : [];
      sendJson(res, 200, filtered);
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
      const userEmail = normalizeOwnerEmail(body?.userEmail || body?.email || LEGACY_OWNER_EMAIL);
      const requestedProvider = normalizePreferredProvider(body?.preferredProvider);
      const autoProvider = requestedProvider || getRecommendedProviderForSavedPhrase({
        phraseText,
        phraseType: body.phraseType || "word",
        difficultyLevel: body.difficultyLevel || "intermediate",
      });

      // Remove existing entry for same word (case-insensitive)
      const filtered = existing.filter((p) => {
        const phraseOwner = normalizeOwnerEmail(p?.userEmail || p?.email || LEGACY_OWNER_EMAIL);
        return !(phraseOwner === userEmail && p.phraseText?.toLowerCase() === phraseText.toLowerCase());
      });

      const phrase = {
        id,
        userEmail,
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
      sendJson(res, 200, { ok: true, phrase, enrichment: { status: "queued", provider: autoProvider } });
      void enrichSavedExtensionPhrase({ phraseId: id, phraseText, provider: autoProvider, previousExplanation: body.explanation });
    } catch (err) {
      sendJson(res, 500, { error: String(err) });
    }
    return;
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/extension/saved-phrases/")) {
    try {
      const entryId = decodeURIComponent(pathname.slice("/api/extension/saved-phrases/".length)).trim();
      const userEmail = normalizeOwnerEmail(url.searchParams.get("userEmail") || url.searchParams.get("email"));

      if (!entryId) {
        sendJson(res, 400, { error: "entry id is required" });
        return;
      }

      const existing = existsSync(EXT_PHRASES_FILE)
        ? JSON.parse(readFileSync(EXT_PHRASES_FILE, "utf8"))
        : [];

      const updated = existing.filter(
        (phrase) => {
          const phraseOwner = normalizeOwnerEmail(phrase?.userEmail || phrase?.email || LEGACY_OWNER_EMAIL);
          const ownerMatches = userEmail ? phraseOwner === userEmail : false;
          const entryMatches = phrase?.id === entryId || String(phrase?.phraseText || "").trim().toLowerCase() === entryId.toLowerCase();
          return !(ownerMatches && entryMatches);
        }
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

  // ── Google Cloud TTS proxy ──────────────────────────────────────
  if (req.method === "POST" && pathname === "/api/tts/cache") {
    try {
      const body = await readJsonBody(req);
      const items = Array.isArray(body?.items) ? body.items : [body];
      const forceRefresh = Boolean(body?.forceRefresh);
      const results = await Promise.all(items.map(async (item, index) => {
        const request = {
          text: item?.text,
          languageCode: item?.language,
          voiceName: item?.voice,
          speakingRate: item?.speakingRate,
          preferProvider: String(item?.preferProvider || "").trim().toLowerCase(),
          forceRefresh,
        };
        let entry = await getExistingTtsCacheEntry(request);

        if (!entry) {
          scheduleTtsCacheGeneration(request);
          entry = {
            text: normalizeTtsText(item?.text),
            language: normalizeLanguageCode(item?.language),
            voice: normalizeVoiceName(item?.voice, item?.language),
            ttsHash: createStableTtsHash({
              text: item?.text,
              languageCode: item?.language,
              voiceName: item?.voice,
            }),
            audioUrl: "",
            playbackUrl: "",
            audioStatus: "pending",
          };
        }

        return {
          key: String(item?.key || index),
          text: entry?.text || normalizeTtsText(item?.text),
          language: entry?.language || normalizeLanguageCode(item?.language),
          voice: entry?.voice || normalizeVoiceName(item?.voice, item?.language),
          ttsHash: entry?.ttsHash || "",
          audioUrl: entry?.audioUrl || "",
          playbackUrl: entry?.playbackUrl || "",
          audioStatus: entry?.audioStatus || "error",
        };
      }));

      sendJson(res, 200, { items: results });
    } catch (err) {
      sendJson(res, 500, { error: String(err) });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/tts") {
    try {
      const body = await readJsonBody(req);
      const text = normalizeTtsText(body?.text);
      if (!text) { sendJson(res, 400, { error: "text is required" }); return; }
      const voiceName = normalizeVoiceName(body?.voiceName, body?.languageCode);
      const languageCode = normalizeLanguageCode(body?.languageCode);
      const speakingRate = Number(body?.speakingRate || env.GOOGLE_TTS_SPEAKING_RATE || 0.9);
      const includeWordTimings = Boolean(body?.includeWordTimings);
      const forceRefresh = Boolean(body?.forceRefresh);
      const preferProvider = String(body?.preferProvider || "").trim().toLowerCase();
      const entry = await ensureTtsCacheEntry({
        text,
        voiceName,
        languageCode,
        speakingRate,
        includeWordTimings,
        forceRefresh,
        preferProvider,
      });

      if (entry?.audioUrl && !forceRefresh) {
        sendJson(res, 200, {
          audioUrl: entry.audioUrl,
          playbackUrl: entry.playbackUrl || "",
          cached: true,
          wordTimings: entry.wordTimings || [],
        });
        return;
      }

      if (!entry?.audioUrl) {
        sendJson(res, 500, { error: "All TTS providers failed" });
        return;
      }

      sendJson(res, 200, {
        audioUrl: entry.audioUrl,
        playbackUrl: entry.playbackUrl || "",
        wordTimings: entry.wordTimings || [],
        provider: preferProvider || "auto",
      });
    } catch (err) { sendJson(res, 500, { error: String(err) }); }
    return;
  }

  if ((req.method === "GET" || req.method === "HEAD") && pathname === "/api/tts/file") {
    const objectKey = String(url.searchParams.get("objectKey") || "").trim();
    if (!objectKey) {
      res.writeHead(400);
      res.end();
      return;
    }
    await streamSpacesObjectToResponse(req, res, objectKey);
    return;
  }

  // ── Audio cache helpers ─────────────────────────────────────────
  // GET /api/audio/url?text=...  → { url: "..." }  (checks cache, generates if missing)
  if (req.method === "GET" && pathname === "/api/audio/url") {
    try {
      const text = url.searchParams.get("text") || "";
      if (!text.trim()) { sendJson(res, 400, { error: "text is required" }); return; }
      const audioUrl = await getOrGenerateAudioUrl(text);
      if (!audioUrl) { sendJson(res, 503, { error: "Audio generation failed" }); return; }
      sendJson(res, 200, { url: audioUrl });
    } catch (err) { sendJson(res, 500, { error: String(err) }); }
    return;
  }

  // GET /api/audio/stream?text=...  → streams MP3 bytes while caching to Spaces in background
  if (req.method === "GET" && pathname === "/api/audio/stream") {
    try {
      const text = url.searchParams.get("text") || "";
      if (!text.trim()) { res.writeHead(400); res.end("text is required"); return; }

      const voiceName = env.GOOGLE_TTS_VOICE || "en-US-Neural2-J";
      const languageCode = env.GOOGLE_TTS_LANGUAGE || "en-US";
      const speakingRate = Number(env.GOOGLE_TTS_SPEAKING_RATE || 0.9);
      const cacheKey = createTtsCacheKey({ text: text.trim(), voiceName, languageCode, speakingRate, includeWordTimings: false });

      // If already cached, redirect to CDN — instant playback
      const cached = await getCachedTtsAudio(cacheKey);
      if (cached?.audio_url) {
        res.writeHead(302, { Location: cached.audio_url, "Access-Control-Allow-Origin": "*" });
        res.end();
        return;
      }

      // Not cached: stream from Polly while uploading to Spaces in background
      if (!pollyClient) { res.writeHead(503); res.end("Polly not configured"); return; }

      const audioCmd = new SynthesizeSpeechCommand({ Text: text.trim(), VoiceId: "Joanna", Engine: "standard", OutputFormat: "mp3" });
      const audioRes = await pollyClient.send(audioCmd);
      if (!audioRes.AudioStream) { res.writeHead(500); res.end("No audio stream"); return; }

      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
        "Transfer-Encoding": "chunked",
      });

      const chunks = [];
      for await (const chunk of audioRes.AudioStream) {
        chunks.push(chunk);
        res.write(chunk);
      }
      res.end();

      // Background: upload concatenated buffer to Spaces and save to cache
      const fullBuffer = Buffer.concat(chunks);
      const audioContent = fullBuffer.toString("base64");
      void storeTtsAudio({ cacheKey, text: text.trim(), provider: "aws", audioContent, voiceName, languageCode, speakingRate, includeWordTimings: false, wordTimings: [] }).catch(() => {});
      void recordTtsUsage("aws", text).catch(() => {});
    } catch (err) {
      if (!res.headersSent) { res.writeHead(500); }
      res.end();
      console.warn("/api/audio/stream error:", err instanceof Error ? err.message : err);
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/translate") {
    try {
      const body = await readJsonBody(req);
      const texts = Array.isArray(body?.texts)
        ? body.texts.map((item) => String(item || "").trim())
        : [String(body?.text || "").trim()];
      const filteredTexts = texts.filter(Boolean);
      const source = String(body?.source || "en");
      const target = String(body?.target || "so");
      const apiKey = env.GOOGLE_TRANSLATE_KEY || env.GOOGLE_CLOUD_TRANSLATE_KEY || env.VITE_GOOGLE_TRANSLATE_KEY || env.GOOGLE_TTS_KEY;

      if (!filteredTexts.length) {
        sendJson(res, 400, { error: "text is required" });
        return;
      }

      if (!apiKey) {
        sendJson(res, 503, { error: "Google Translate is not configured" });
        return;
      }

      const translateRes = await fetchWithTimeout(
        `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q: filteredTexts,
            source,
            target,
            format: "text",
          }),
        }
      );
      const data = await translateRes.json();
      const translations = Array.isArray(data?.data?.translations)
        ? data.data.translations.map((entry) => String(entry?.translatedText || "").trim())
        : [];

      sendJson(res, translateRes.ok ? 200 : 500, { translations, error: data?.error?.message });
    } catch (err) {
      sendJson(res, 500, { error: String(err) });
    }
    return;
  }

  // ── Saved words (Neon) ──────────────────────────────────────────
  if (req.method === "GET" && pathname === "/api/words") {
    try {
      if (!sql) { sendJson(res, 200, []); return; }
      await ensureSavedWordsSchema();
      const authClaim = await validateSessionToken(req);
      if (!authClaim) { sendJson(res, 401, { error: "Authentication required" }); return; }
      const rows = await sql`SELECT * FROM saved_words WHERE user_email = ${authClaim.email} ORDER BY saved_at DESC`;
      sendJson(res, 200, rows);
    } catch (err) { sendJson(res, 500, { error: String(err) }); }
    return;
  }

  if (req.method === "POST" && pathname === "/api/words") {
    try {
      if (!sql) { sendJson(res, 503, { error: "Database not configured" }); return; }
      await ensureSavedWordsSchema();
      const authClaim = await validateSessionToken(req);
      if (!authClaim) { sendJson(res, 401, { error: "Authentication required" }); return; }
      const body = await readJsonBody(req);
      const userEmail = authClaim.email;
      const word = String(body?.word || "").trim().toLowerCase();
      if (!word) { sendJson(res, 400, { error: "word is required" }); return; }
      const phraseData = body.phrase_data ?? null;
      const existingAudioUrl = String(phraseData?.audioUrl || "").trim();
      const existingAudioStatus = String(phraseData?.audio?.audioStatus || "").trim();
      const existingVoiceName = String(phraseData?.audio?.voice || "").trim();
      const existingLanguageCode = String(phraseData?.audio?.language || "").trim();
      const existingTtsHash = String(phraseData?.audio?.ttsHash || "").trim();
      const rows = await sql`
        INSERT INTO saved_words (user_email, word, display_word, translation, note, source, is_manual, is_custom_translation, phrase_data, audio_url, audio_status, voice_name, language_code, tts_hash)
        VALUES (${userEmail}, ${word}, ${body.displayWord || body.display_word || word}, ${body.translation || ""}, ${body.note || ""}, ${body.source || ""}, ${body.isManual || false}, ${body.isCustomTranslation || false}, ${phraseData}, ${existingAudioUrl}, ${existingAudioStatus}, ${existingVoiceName}, ${existingLanguageCode}, ${existingTtsHash})
        ON CONFLICT (user_email, word) DO UPDATE SET
          display_word = EXCLUDED.display_word,
          translation = EXCLUDED.translation,
          note = EXCLUDED.note,
          source = EXCLUDED.source,
          is_manual = EXCLUDED.is_manual,
          is_custom_translation = EXCLUDED.is_custom_translation,
          phrase_data = EXCLUDED.phrase_data,
          audio_url = CASE WHEN EXCLUDED.audio_url != '' THEN EXCLUDED.audio_url ELSE saved_words.audio_url END,
          audio_status = CASE WHEN EXCLUDED.audio_status != '' THEN EXCLUDED.audio_status ELSE saved_words.audio_status END,
          voice_name = CASE WHEN EXCLUDED.voice_name != '' THEN EXCLUDED.voice_name ELSE saved_words.voice_name END,
          language_code = CASE WHEN EXCLUDED.language_code != '' THEN EXCLUDED.language_code ELSE saved_words.language_code END,
          tts_hash = CASE WHEN EXCLUDED.tts_hash != '' THEN EXCLUDED.tts_hash ELSE saved_words.tts_hash END,
          saved_at = NOW()
        RETURNING *
      `;
      sendJson(res, 200, rows[0]);
      if (!rows[0]?.audio_url) {
        void prewarmWordAudio(word, userEmail);
      }
    } catch (err) { sendJson(res, 500, { error: String(err) }); }
    return;
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/words/")) {
    try {
      if (!sql) { sendJson(res, 503, { error: "Database not configured" }); return; }
      await ensureSavedWordsSchema();
      const authClaim = await validateSessionToken(req);
      if (!authClaim) { sendJson(res, 401, { error: "Authentication required" }); return; }
      const word = decodeURIComponent(pathname.slice("/api/words/".length));
      await sql`DELETE FROM saved_words WHERE user_email = ${authClaim.email} AND word = ${word}`;
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
      const strictProvider = Boolean(body?.strictProvider);

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

  if (req.method === "POST" && pathname === "/api/extension/somali-support") {
    try {
      const body = await readJsonBody(req);
      const word = String(body?.word || body?.phraseText || "").trim().toLowerCase();
      const sentenceContext = String(body?.sentenceContext || "").trim();
      const preferredProvider = normalizePreferredProvider(body?.preferredProvider);
      const strictProvider = Boolean(body?.strictProvider);

      if (!word) {
        sendJson(res, 400, { error: "word is required" });
        return;
      }

      const support = await getExtensionSomaliSupport({ word, sentenceContext, preferredProvider, strictProvider });
      sendJson(res, 200, support);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not fetch Somali support";
      console.warn("[AI] Somali support unavailable:", message);
      sendJson(res, 200, { somaliMeaning: "", somaliExplanation: "", somaliSentence: "", error: "Somali AI support is unavailable right now." });
      return;
    }
  }

  if (req.method === "GET" && pathname.startsWith("/api/transcript/")) {
    try {
      const videoId = decodeURIComponent(pathname.slice("/api/transcript/".length));
      const preferredProvider = normalizePreferredProvider(url.searchParams.get("preferredProvider"));
      const transcriptLang = "en";

      if (!videoId) {
        sendJson(res, 400, { detail: "video id is required" });
        return;
      }

      const transcriptCacheKey = `yt-transcript:${videoId}:${transcriptLang}`;
      let entries = ytCacheGet(transcriptCacheKey);

      if (!entries) {
        const transcript = await fetchYoutubeTranscript(videoId, { lang: transcriptLang });
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
              lang: String(item?.lang || transcriptLang),
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

      const shouldWaitForTranslations = url.searchParams.get("translate") === "1";
      const transcriptWithTranslations = shouldWaitForTranslations
        ? await translateTranscriptEntriesToSomali({
            videoId,
            entries,
            preferredProvider,
          })
        : getTranscriptEntriesWithCachedTranslations({
            videoId,
            entries,
          });

      if (!shouldWaitForTranslations) {
        void primeTranscriptTranslations({
          videoId,
          entries,
          preferredProvider,
        });
      }

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
      const refresh    = url.searchParams.get("refresh") === "1";
      const result     = channelSeed
        ? await fetchVideosForChannelSeed(ytKey, { channelSeed, sort, pageToken, refresh })
        : await fetchYouTubeVideos(ytKey, { channelId, sort, pageToken, q, refresh });
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

  if (!pathname.startsWith("/api/") && tryServeFrontend(req, res, pathname)) {
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
const YT_API_CACHE_TTL_MS = 2 * 60 * 1000;
const PLAYLIST_WINDOW_CACHE_TTL_MS = 5 * 60 * 1000;
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

async function ytFetch(apiKey, endpoint, params, options = {}) {
  const url = new URL(`${YT_BASE}/${endpoint}`);
  url.searchParams.set("key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const cacheKey = url.toString();
  const cached = options.skipCache ? null : ytCacheGet(cacheKey);
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
  ytCacheSet(cacheKey, data, YT_API_CACHE_TTL_MS);
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

async function fetchVideosForChannelSeed(apiKey, { channelSeed, sort, pageToken, refresh = false }) {
  const resolvedChannel = await resolveChannelSeed(apiKey, channelSeed);
  if (resolvedChannel?.id) {
    return fetchYouTubeVideos(apiKey, { channelId: resolvedChannel.id, sort, pageToken, q: "", refresh });
  }

  return fetchYouTubeVideos(apiKey, {
    channelId: "",
    sort,
    pageToken,
    q: cleanChannelSeedQuery(channelSeed),
    refresh,
  });
}

async function fetchYouTubeVideos(apiKey, { channelId, sort, pageToken, q, refresh = false }) {
  if (!channelId && !q) {
    return fetchCuratedYouTubeVideos(apiKey, { sort, pageToken, refresh });
  }

  if (channelId) {
    const channel = await fetchChannelById(apiKey, channelId);
    if (channel?.uploadsPlaylistId) {
      return fetchPlaylistBackedVideos(apiKey, {
        playlistId: channel.uploadsPlaylistId,
        sort,
        pageToken,
        sampleSize: 200,
        refresh,
      });
    }
  }

  const searchParams = {
    part: "snippet",
    type: "video",
    order: sort,
    maxResults: 50,
    relevanceLanguage: "en",
    videoDuration: "medium", // exclude Shorts (< 4 min) at the API level
  };
  if (channelId) searchParams.channelId = channelId;
  if (pageToken)  searchParams.pageToken = pageToken;
  // If no channel selected and no search query, default to "learn english"
  if (q)          searchParams.q = q;
  else if (!channelId) searchParams.q = "learn english";

  const searchData = await ytFetch(apiKey, "search", searchParams, { skipCache: refresh });
  const items = searchData.items || [];
  const videoIds = items.map(i => i.id?.videoId).filter(Boolean).join(",");

  let statsMap = {};
  if (videoIds) {
    const statsData = await ytFetch(apiKey, "videos", {
      part: "statistics,contentDetails",
      id: videoIds,
    }, { skipCache: refresh });
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

async function fetchPlaylistWindow(apiKey, { playlistId, limit = 75, refresh = false }) {
  const cacheKey = `playlist-window:${playlistId}:${limit}`;
  const cached = refresh ? null : ytCacheGet(cacheKey);
  if (cached) return cached;

  const items = [];
  let nextPageToken = "";

  while (items.length < limit) {
    const batch = await ytFetch(apiKey, "playlistItems", {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: Math.min(50, limit - items.length),
      pageToken: nextPageToken,
    }, { skipCache: refresh });

    items.push(...(batch.items || []));
    if (!batch.nextPageToken) break;
    nextPageToken = batch.nextPageToken;
  }

  ytCacheSet(cacheKey, items, PLAYLIST_WINDOW_CACHE_TTL_MS);
  return items;
}

async function fetchYouTubeVideoDetails(apiKey, videoIds, options = {}) {
  const detailsMap = {};

  for (let index = 0; index < videoIds.length; index += 50) {
    const chunk = videoIds.slice(index, index + 50);
    if (!chunk.length) continue;

    const data = await ytFetch(apiKey, "videos", {
      part: "snippet,statistics,contentDetails",
      id: chunk.join(","),
    }, { skipCache: options.refresh === true });

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

async function fetchPlaylistBackedVideos(apiKey, { playlistId, sort, pageToken, sampleSize, refresh = false }) {
  const pageSize = sort === "date" ? 100 : 50;
  const offset = parsePlaylistOffset(pageToken, playlistId, sort);
  const playlistItems = await fetchPlaylistWindow(apiKey, { playlistId, limit: sampleSize, refresh });

  const videoIds = playlistItems
    .map((item) => item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId || "")
    .filter(Boolean);

  const detailsMap = await fetchYouTubeVideoDetails(apiKey, videoIds, { refresh });
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

async function fetchCuratedYouTubeVideos(apiKey, { sort, pageToken, refresh = false }) {
  const channels = await fetchCuratedChannels(apiKey);
  const offset = parseCuratedOffset(pageToken);
  const pageSize = sort === "date" ? 100 : 50;
  const maxResultsPerChannel = sort === "viewCount" ? 12 : 16;

  const playlistResults = await Promise.all(
    channels
      .filter((channel) => channel.uploadsPlaylistId)
      .map((channel) => fetchPlaylistWindow(apiKey, {
        playlistId: channel.uploadsPlaylistId,
        limit: maxResultsPerChannel,
        refresh,
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

  const detailsMap = await fetchYouTubeVideoDetails(apiKey, uniqueItems, { refresh });

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

  let arrangedVideos;
  if (sort === "viewCount") {
    videos.sort((a, b) => b.viewCount - a.viewCount);
    arrangedVideos = videos;
  } else {
    // Interleave by channel so no single prolific channel floods the feed.
    // Each channel's videos are sorted newest-first, then we round-robin across channels.
    const byChannel = new Map();
    for (const video of videos) {
      const key = video.channelId || "unknown";
      if (!byChannel.has(key)) byChannel.set(key, []);
      byChannel.get(key).push(video);
    }
    for (const channelVideos of byChannel.values()) {
      channelVideos.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    }
    const queues = [...byChannel.values()];
    arrangedVideos = [];
    let qi = 0;
    while (queues.some((q) => q.length > 0)) {
      const queue = queues[qi % queues.length];
      if (queue.length > 0) arrangedVideos.push(queue.shift());
      qi++;
    }
  }

  const pagedVideos = arrangedVideos.slice(offset, offset + pageSize);
  const nextPageToken = offset + pageSize < arrangedVideos.length ? `curated:${offset + pageSize}` : null;

  return {
    videos: pagedVideos,
    nextPageToken,
    totalResults: arrangedVideos.length,
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

async function fetchYoutubeTranscript(videoId, options = {}) {
  if (typeof YoutubeTranscriptModule.fetchTranscript === "function") {
    return YoutubeTranscriptModule.fetchTranscript(videoId, options);
  }

  if (typeof YoutubeTranscriptModule.YoutubeTranscript?.fetchTranscript === "function") {
    return YoutubeTranscriptModule.YoutubeTranscript.fetchTranscript(videoId, options);
  }

  throw new Error("youtube-transcript export is unavailable");
}

function getTranscriptTranslationCacheKey(videoId, entries) {
  const sourceLang = String(entries.find((entry) => entry?.lang)?.lang || "unknown").trim().toLowerCase();
  return `transcript-translation:${videoId}:${sourceLang}`;
}

function getTranscriptEntriesWithCachedTranslations({ videoId, entries }) {
  const cacheKey = getTranscriptTranslationCacheKey(videoId, entries);
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
  const cacheKey = getTranscriptTranslationCacheKey(videoId, entries);
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
          task: "bulk",
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

function normalizeOwnerEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function ensureSavedWordsSchema() {
  if (!sql) return;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS saved_words (
        user_email TEXT NOT NULL DEFAULT 'maahir.engineer@gmail.com',
        word TEXT NOT NULL,
        display_word TEXT NOT NULL DEFAULT '',
        translation TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        is_manual BOOLEAN NOT NULL DEFAULT FALSE,
        is_custom_translation BOOLEAN NOT NULL DEFAULT FALSE,
        saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        phrase_data JSONB,
        audio_url TEXT NOT NULL DEFAULT '',
        audio_status TEXT NOT NULL DEFAULT '',
        voice_name TEXT NOT NULL DEFAULT '',
        language_code TEXT NOT NULL DEFAULT '',
        tts_hash TEXT NOT NULL DEFAULT ''
      )
    `;
    await sql`ALTER TABLE saved_words ADD COLUMN IF NOT EXISTS user_email TEXT NOT NULL DEFAULT 'maahir.engineer@gmail.com'`;
    await sql`ALTER TABLE saved_words ADD COLUMN IF NOT EXISTS display_word TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE saved_words ADD COLUMN IF NOT EXISTS translation TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE saved_words ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE saved_words ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE saved_words ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE`;
    await sql`ALTER TABLE saved_words ADD COLUMN IF NOT EXISTS is_custom_translation BOOLEAN NOT NULL DEFAULT FALSE`;
    await sql`ALTER TABLE saved_words ADD COLUMN IF NOT EXISTS saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
    await sql`ALTER TABLE saved_words ADD COLUMN IF NOT EXISTS phrase_data JSONB`;
    await sql`ALTER TABLE saved_words ADD COLUMN IF NOT EXISTS audio_url TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE saved_words ADD COLUMN IF NOT EXISTS audio_status TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE saved_words ADD COLUMN IF NOT EXISTS voice_name TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE saved_words ADD COLUMN IF NOT EXISTS language_code TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE saved_words ADD COLUMN IF NOT EXISTS tts_hash TEXT NOT NULL DEFAULT ''`;
    await sql`UPDATE saved_words SET user_email = ${LEGACY_OWNER_EMAIL} WHERE user_email IS NULL OR user_email = ''`;
    await sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'saved_words_pkey'
            AND conrelid = 'saved_words'::regclass
        ) THEN
          ALTER TABLE saved_words DROP CONSTRAINT saved_words_pkey;
        END IF;
      END $$;
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS saved_words_user_email_word_idx ON saved_words (user_email, word)`;
    await sql`CREATE INDEX IF NOT EXISTS saved_words_user_email_saved_at_idx ON saved_words (user_email, saved_at DESC)`;
  } catch (error) {
    console.warn("Could not initialize saved_words schema:", error);
  }
}

async function ensureAuthUsersSchema() {
  if (!sql) return;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY,
        google_sub TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        full_name TEXT NOT NULL DEFAULT '',
        picture_url TEXT NOT NULL DEFAULT '',
        profile JSONB NOT NULL DEFAULT '{}'::jsonb,
        login_count INTEGER NOT NULL DEFAULT 0,
        first_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE auth_users ALTER COLUMN google_sub DROP NOT NULL`;
    await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS picture_url TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'::jsonb`;
    await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE`;
    await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'google'`;
    await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT TRUE`;
    await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS login_count INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
    await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
    await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS session_token_hash TEXT NOT NULL DEFAULT ''`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS auth_users_google_sub_idx ON auth_users (google_sub)`;
    await sql`CREATE INDEX IF NOT EXISTS auth_users_email_idx ON auth_users (email)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS auth_users_email_unique_idx ON auth_users (email)`;
    await sql`CREATE INDEX IF NOT EXISTS auth_users_last_login_at_idx ON auth_users (last_login_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS auth_users_session_token_hash_idx ON auth_users (session_token_hash)`;
  } catch (error) {
    console.warn("Could not initialize auth_users schema:", error);
  }
}

async function issueSessionToken(userId) {
  const raw = randomBytes(32).toString("hex");
  const hash = sha256(raw);
  if (sql) {
    await sql`UPDATE auth_users SET session_token_hash = ${hash} WHERE id = ${userId}`.catch(() => {});
  }
  return raw;
}

async function validateSessionToken(req) {
  if (!sql) return null;
  const authHeader = String(req.headers["authorization"] || "");
  if (!authHeader.startsWith("Bearer ")) return null;
  const raw = authHeader.slice(7).trim();
  if (!raw) return null;
  const hash = sha256(raw);
  const rows = await sql`
    SELECT id, email FROM auth_users WHERE session_token_hash = ${hash} LIMIT 1
  `.catch(() => []);
  if (!rows.length) return null;
  return { userId: rows[0].id, email: normalizeOwnerEmail(rows[0].email) };
}

async function ensurePasswordResetTokensSchema() {
  if (!sql) return;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens (user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx ON password_reset_tokens (expires_at DESC)`;
  } catch (error) {
    console.warn("Could not initialize password_reset_tokens schema:", error);
  }
}

async function ensureEmailVerificationTokensSchema() {
  if (!sql) return;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS email_verification_tokens_user_id_idx ON email_verification_tokens (user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS email_verification_tokens_expires_at_idx ON email_verification_tokens (expires_at DESC)`;
  } catch (error) {
    console.warn("Could not initialize email_verification_tokens schema:", error);
  }
}

async function ensureTtsAudioCacheSchema() {
  if (!sql) return;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS tts_audio_cache (
        cache_key TEXT PRIMARY KEY,
        provider TEXT NOT NULL DEFAULT 'google',
        voice_name TEXT NOT NULL DEFAULT '',
        language_code TEXT NOT NULL DEFAULT '',
        speaking_rate TEXT NOT NULL DEFAULT '',
        include_word_timings BOOLEAN NOT NULL DEFAULT FALSE,
        text_hash TEXT NOT NULL DEFAULT '',
        tts_hash TEXT NOT NULL DEFAULT '',
        normalized_text TEXT NOT NULL DEFAULT '',
        audio_status TEXT NOT NULL DEFAULT 'ready',
        audio_url TEXT NOT NULL,
        audio_object_key TEXT NOT NULL,
        word_timings JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE tts_audio_cache ADD COLUMN IF NOT EXISTS include_word_timings BOOLEAN NOT NULL DEFAULT FALSE`;
    await sql`ALTER TABLE tts_audio_cache ADD COLUMN IF NOT EXISTS word_timings JSONB NOT NULL DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE tts_audio_cache ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
    await sql`ALTER TABLE tts_audio_cache ADD COLUMN IF NOT EXISTS tts_hash TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE tts_audio_cache ADD COLUMN IF NOT EXISTS normalized_text TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE tts_audio_cache ADD COLUMN IF NOT EXISTS audio_status TEXT NOT NULL DEFAULT 'ready'`;
    await sql`CREATE INDEX IF NOT EXISTS tts_audio_cache_signature_idx ON tts_audio_cache (tts_hash, language_code, voice_name, include_word_timings)`;
    await sql`
      CREATE TABLE IF NOT EXISTS tts_usage_monthly (
        provider TEXT NOT NULL,
        month_key TEXT NOT NULL,
        characters_used INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (provider, month_key)
      )
    `;
  } catch (error) {
    console.warn("Could not initialize tts_audio_cache schema:", error);
  }
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

function tryServeFrontend(req, res, pathname) {
  if ((req.method !== "GET" && req.method !== "HEAD") || !existsSync(DIST_DIR)) {
    return false;
  }

  const indexPath = join(DIST_DIR, "index.html");
  if (!existsSync(indexPath)) {
    return false;
  }

  const cleanedPath = decodeURIComponent(String(pathname || "/")).replace(/^\/+/, "");
  if (cleanedPath) {
    const candidatePath = resolve(DIST_DIR, cleanedPath);
    const distRoot = `${resolve(DIST_DIR)}${sep}`;

    if (candidatePath.startsWith(distRoot) && existsSync(candidatePath) && statSync(candidatePath).isFile()) {
      serveStaticFile(req, res, candidatePath);
      return true;
    }

    if (extname(cleanedPath)) {
      return false;
    }
  }

  serveStaticFile(req, res, indexPath);
  return true;
}

function serveStaticFile(req, res, filePath) {
  const extension = extname(filePath).toLowerCase();
  const contentType = {
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
    ".otf": "font/otf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  }[extension] || "application/octet-stream";

  const isHtml = extension === ".html";
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": isHtml ? "no-cache" : "public, max-age=31536000, immutable",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(filePath)
    .on("error", () => {
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Could not read frontend asset" });
        return;
      }
      res.destroy();
    })
    .pipe(res);
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function escapeSsml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildTtsMarkedText(text) {
  const parts = String(text).match(/\s+|\S+/g) || [];
  const words = [];
  let ssml = "<speak>";

  for (const part of parts) {
    if (/^\s+$/.test(part)) {
      ssml += part;
      continue;
    }

    const index = words.length;
    words.push(part);
    ssml += `<mark name="w${index}"/>${escapeSsml(part)}`;
  }

  ssml += "</speak>";
  return { ssml, words };
}

function buildWordTimings(words, timepoints) {
  const starts = new Map();

  for (const point of Array.isArray(timepoints) ? timepoints : []) {
    const match = String(point?.markName || "").match(/^w(\d+)$/);
    if (!match) continue;
    const index = Number(match[1]);
    const startTime = Number(point?.timeSeconds);
    if (Number.isFinite(index) && Number.isFinite(startTime)) {
      starts.set(index, startTime);
    }
  }

  return words.map((word, index) => {
    const startTime = starts.get(index) ?? (index === 0 ? 0 : starts.get(index - 1) ?? 0);
    const nextStart = starts.get(index + 1);

    return {
      index,
      word,
      startTime,
      endTime: Number.isFinite(nextStart) ? nextStart : startTime + 0.45,
    };
  });
}

function normalizeTtsText(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function normalizeLanguageCode(value) {
  return String(value || env.GOOGLE_TTS_LANGUAGE || "en-US").trim() || "en-US";
}

function normalizeVoiceName(value, languageCode = "en-US") {
  const explicitVoice = String(value || "").trim();
  if (explicitVoice) return explicitVoice;

  if (languageCode.toLowerCase().startsWith("so")) {
    return String(env.GOOGLE_TTS_SOMALI_VOICE || env.GOOGLE_TTS_SO_VOICE || "").trim();
  }

  return String(env.GOOGLE_TTS_VOICE || "en-US-Neural2-J").trim();
}

function sanitizeObjectSegment(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function createStableTtsHash({ text, languageCode, voiceName }) {
  return sha256(JSON.stringify({
    text: normalizeTtsText(text),
    languageCode: normalizeLanguageCode(languageCode),
    voiceName: normalizeVoiceName(voiceName, languageCode),
  }));
}

function getCurrentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function getTtsCharacterCount(text) {
  return String(text || "").trim().length;
}

function getTtsMonthlyCharacterCap(provider) {
  const envKey = provider === "google" ? "GOOGLE_TTS_MONTHLY_CHAR_CAP" : "AWS_POLLY_MONTHLY_CHAR_CAP";
  const value = Number(env[envKey] || 0);
  return Number.isFinite(value) && value > 0 ? value : Infinity;
}

async function getTtsMonthlyUsage(provider) {
  if (!sql) return 0;

  try {
    await ensureTtsAudioCacheSchema();
    const rows = await sql`
      SELECT characters_used
      FROM tts_usage_monthly
      WHERE provider = ${provider} AND month_key = ${getCurrentMonthKey()}
      LIMIT 1
    `;
    return Number(rows[0]?.characters_used || 0);
  } catch (error) {
    console.warn("Could not read TTS usage:", error);
    return 0;
  }
}

async function canUseTtsProvider(provider, text) {
  const cap = getTtsMonthlyCharacterCap(provider);
  if (cap === Infinity) return true;
  const used = await getTtsMonthlyUsage(provider);
  return used + getTtsCharacterCount(text) <= cap;
}

async function recordTtsUsage(provider, text) {
  if (!sql) return;

  try {
    await ensureTtsAudioCacheSchema();
    await sql`
      INSERT INTO tts_usage_monthly (provider, month_key, characters_used, updated_at)
      VALUES (${provider}, ${getCurrentMonthKey()}, ${getTtsCharacterCount(text)}, NOW())
      ON CONFLICT (provider, month_key) DO UPDATE SET
        characters_used = tts_usage_monthly.characters_used + EXCLUDED.characters_used,
        updated_at = NOW()
    `;
  } catch (error) {
    console.warn("Could not record TTS usage:", error);
  }
}

async function synthesizeCloudTts({ text, voiceName, languageCode, speakingRate, includeWordTimings, preferProvider = "" }) {
  const providers = preferProvider === "aws"
    ? ["aws", "google"]
    : preferProvider === "google"
      ? ["google", "aws"]
      : ["google", "aws"];
  const errors = [];

  for (const provider of providers) {
    if (!(await canUseTtsProvider(provider, text))) {
      errors.push(`${provider} monthly cap reached`);
      continue;
    }

    try {
      const result = provider === "google"
        ? await synthesizeWithGoogleTts({ text, voiceName, languageCode, speakingRate, includeWordTimings })
        : await synthesizeWithPolly(text, includeWordTimings);

      if (result?.audioContent) {
        await recordTtsUsage(provider, text);
        return { ...result, provider };
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (errors.length) {
    console.warn("TTS providers failed:", errors.join(" | "));
  }
  return null;
}

async function synthesizeWithGoogleTts({ text, voiceName, languageCode, speakingRate, includeWordTimings }) {
  const accessToken = await getTtsAccessToken();
  const apiKey = env.GOOGLE_TTS_KEY || env.GOOGLE_CLOUD_TTS_KEY || env.VITE_GOOGLE_TTS_KEY;
  if (!accessToken && !apiKey) return null;

  const markedText = includeWordTimings ? buildTtsMarkedText(text) : null;
  const ttsEndpointVersion = includeWordTimings ? "v1beta1" : "v1";
  const ttsUrl = accessToken
    ? `https://texttospeech.googleapis.com/${ttsEndpointVersion}/text:synthesize`
    : `https://texttospeech.googleapis.com/${ttsEndpointVersion}/text:synthesize?key=${apiKey}`;

  const ttsRes = await fetchWithTimeout(
    ttsUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        input: includeWordTimings && markedText ? { ssml: markedText.ssml } : { text },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: "MP3", speakingRate },
        ...(includeWordTimings ? { enableTimePointing: ["SSML_MARK"] } : {}),
      }),
    },
    TTS_REQUEST_TIMEOUT_MS
  );

  if (!ttsRes.ok) {
    const message = await ttsRes.text().catch(() => "");
    throw new Error(`Google TTS failed (${ttsRes.status}): ${message.slice(0, 240)}`);
  }

  const googleData = await ttsRes.json();
  const audioContent = googleData.audioContent || "";
  if (!audioContent) return null;

  return {
    audioContent,
    wordTimings: includeWordTimings && markedText
      ? buildWordTimings(markedText.words, googleData.timepoints || [])
      : [],
  };
}

function sha256(value, encoding = "hex") {
  return createHash("sha256").update(value).digest(encoding);
}

function hmac(key, value, encoding) {
  return createHmac("sha256", key).update(value).digest(encoding);
}

function createTtsCacheKey({ text, voiceName, languageCode, includeWordTimings }) {
  return sha256(JSON.stringify({
    provider: "cloud-tts",
    text: normalizeTtsText(text),
    voiceName: normalizeVoiceName(voiceName, languageCode),
    languageCode: normalizeLanguageCode(languageCode),
    includeWordTimings: Boolean(includeWordTimings),
  }));
}

function createTtsObjectKey({ languageCode, voiceName, ttsHash }) {
  return `tts/${sanitizeObjectSegment(languageCode, "lang")}/${sanitizeObjectSegment(voiceName, "voice")}/${ttsHash}.mp3`;
}

function createTtsPlaybackUrl(objectKey) {
  return `/api/tts/file?objectKey=${encodeURIComponent(objectKey)}`;
}

function getSpacesConfig() {
  const endpoint = String(env.DO_SPACES_ENDPOINT || "").replace(/\/+$/, "");
  const region = String(env.DO_SPACES_REGION || "").trim();
  const bucket = String(env.DO_SPACES_BUCKET || "").trim();
  const accessKeyId = String(env.DO_SPACES_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(env.DO_SPACES_SECRET_ACCESS_KEY || "").trim();
  const publicBaseUrl = String(env.DO_SPACES_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    return null;
  }

  return { endpoint, region, bucket, accessKeyId, secretAccessKey, publicBaseUrl };
}

async function getCachedTtsAudio(cacheKey) {
  if (!sql) return null;

  try {
    await ensureTtsAudioCacheSchema();
    const rows = await sql`
      SELECT audio_url, audio_object_key, word_timings
      FROM tts_audio_cache
      WHERE cache_key = ${cacheKey}
      LIMIT 1
    `;

    if (!rows.length) return null;

    await sql`
      UPDATE tts_audio_cache
      SET last_used_at = NOW()
      WHERE cache_key = ${cacheKey}
    `;

    return rows[0];
  } catch (error) {
    console.warn("Could not read TTS cache:", error);
    return null;
  }
}

async function streamSpacesObjectToResponse(req, res, objectKey) {
  const spaces = getSpacesConfig();
  if (!spaces || !objectKey) {
    res.writeHead(404);
    res.end();
    return;
  }

  const encodedKey = String(objectKey).split("/").map(encodeURIComponent).join("/");
  const sourceUrl = `${spaces.endpoint}/${spaces.bucket}/${encodedKey}`;
  const rangeHeader = String(req.headers.range || "").trim();
  const method = req.method === "HEAD" ? "HEAD" : "GET";
  const upstreamHeaders = rangeHeader ? { Range: rangeHeader } : {};

  try {
    const upstream = await fetchWithTimeout(sourceUrl, { method, headers: upstreamHeaders }, 10000);
    if (!upstream.ok || !upstream.body) {
      if (method === "HEAD" && upstream.ok) {
        res.writeHead(upstream.status || 200, {
          "Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
          "Cache-Control": upstream.headers.get("cache-control") || "public, max-age=31536000, immutable",
          "Access-Control-Allow-Origin": "*",
          "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
          ...(upstream.headers.get("content-length") ? { "Content-Length": upstream.headers.get("content-length") } : {}),
          ...(upstream.headers.get("content-range") ? { "Content-Range": upstream.headers.get("content-range") } : {}),
        });
        res.end();
        return;
      }

      res.writeHead(upstream.status || 502);
      res.end();
      return;
    }

    res.writeHead(upstream.status || 200, {
      "Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
      "Cache-Control": upstream.headers.get("cache-control") || "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
      ...(upstream.headers.get("content-length") ? { "Content-Length": upstream.headers.get("content-length") } : {}),
      ...(upstream.headers.get("content-range") ? { "Content-Range": upstream.headers.get("content-range") } : {}),
    });

    if (method === "HEAD") {
      res.end();
      return;
    }

    for await (const chunk of upstream.body) {
      res.write(chunk);
    }
    res.end();
  } catch {
    res.writeHead(502);
    res.end();
  }
}

async function findTtsAudioBySignature({ ttsHash, languageCode, voiceName, includeWordTimings }) {
  if (!sql) return null;

  try {
    await ensureTtsAudioCacheSchema();
    const rows = await sql`
      SELECT cache_key, audio_url, audio_object_key, word_timings, provider, voice_name, language_code, tts_hash
      FROM tts_audio_cache
      WHERE tts_hash = ${ttsHash}
        AND language_code = ${languageCode}
        AND voice_name = ${voiceName}
        AND include_word_timings = ${Boolean(includeWordTimings)}
      ORDER BY last_used_at DESC
      LIMIT 1
    `;

    if (!rows.length) return null;
    return rows[0];
  } catch (error) {
    console.warn("Could not look up TTS cache by signature:", error);
    return null;
  }
}

async function publicAudioObjectExists(audioUrl) {
  const targetUrl = String(audioUrl || "").trim();
  if (!targetUrl) return false;

  try {
    const response = await fetchWithTimeout(targetUrl, { method: "HEAD" }, 3000);
    return response.ok;
  } catch {
    return false;
  }
}

async function getOrGenerateAudioUrl(text) {
  const entry = await ensureTtsCacheEntry({ text });
  return entry?.audioUrl || null;
}

async function prewarmWordAudio(word, userEmail) {
  try {
    const audioUrl = await getOrGenerateAudioUrl(word);
    if (!audioUrl || !sql) return;
    await sql`
      UPDATE saved_words
      SET audio_url = ${audioUrl},
          phrase_data = CASE
            WHEN phrase_data IS NOT NULL
            THEN jsonb_set(phrase_data, '{audioUrl}', ${JSON.stringify(audioUrl)}::jsonb)
            ELSE phrase_data
          END
      WHERE user_email = ${userEmail} AND word = ${word}
    `;
  } catch (err) {
    console.warn("prewarmWordAudio failed for", word, err instanceof Error ? err.message : err);
  }
}

async function storeTtsAudio({ cacheKey, text, provider, audioContent, voiceName, languageCode, speakingRate, includeWordTimings, wordTimings }) {
  const spaces = getSpacesConfig();
  if (!sql || !spaces) return null;

  try {
    await ensureTtsAudioCacheSchema();
    const audioBuffer = Buffer.from(audioContent, "base64");
    const normalizedText = normalizeTtsText(text);
    const normalizedLanguageCode = normalizeLanguageCode(languageCode);
    const normalizedVoiceName = normalizeVoiceName(voiceName, normalizedLanguageCode);
    const ttsHash = createStableTtsHash({
      text: normalizedText,
      languageCode: normalizedLanguageCode,
      voiceName: normalizedVoiceName,
    });
    const objectKey = createTtsObjectKey({ languageCode: normalizedLanguageCode, voiceName: normalizedVoiceName, ttsHash });
    const audioUrl = `${spaces.publicBaseUrl}/${objectKey}`;

    if (!(await publicAudioObjectExists(audioUrl))) {
      await uploadToSpaces({
        ...spaces,
        objectKey,
        body: audioBuffer,
        contentType: "audio/mpeg",
        cacheControl: "public, max-age=31536000, immutable",
      });
    }

    await sql`
      INSERT INTO tts_audio_cache (
        cache_key,
        provider,
        voice_name,
        language_code,
        speaking_rate,
        include_word_timings,
        text_hash,
        tts_hash,
        normalized_text,
        audio_status,
        audio_url,
        audio_object_key,
        word_timings,
        created_at,
        last_used_at
      )
      VALUES (
        ${cacheKey},
        ${provider || "cloud"},
        ${normalizedVoiceName},
        ${normalizedLanguageCode},
        ${String(speakingRate)},
        ${Boolean(includeWordTimings)},
        ${sha256(normalizedText)},
        ${ttsHash},
        ${normalizedText},
        ${"ready"},
        ${audioUrl},
        ${objectKey},
        ${JSON.stringify(wordTimings || [])},
        NOW(),
        NOW()
      )
      ON CONFLICT (cache_key) DO UPDATE SET
        provider = EXCLUDED.provider,
        voice_name = EXCLUDED.voice_name,
        language_code = EXCLUDED.language_code,
        tts_hash = EXCLUDED.tts_hash,
        normalized_text = EXCLUDED.normalized_text,
        audio_status = EXCLUDED.audio_status,
        audio_url = EXCLUDED.audio_url,
        audio_object_key = EXCLUDED.audio_object_key,
        word_timings = EXCLUDED.word_timings,
        last_used_at = NOW()
    `;

    return { audioUrl, objectKey, ttsHash, voiceName: normalizedVoiceName, languageCode: normalizedLanguageCode, audioStatus: "ready" };
  } catch (error) {
    console.warn("Could not store TTS audio cache:", error);
    return null;
  }
}

async function ensureTtsCacheEntry({
  text,
  languageCode,
  voiceName,
  speakingRate,
  includeWordTimings = false,
  preferProvider = "",
  forceRefresh = false,
}) {
  const normalizedText = normalizeTtsText(text);
  if (!normalizedText) return null;

  const resolvedLanguageCode = normalizeLanguageCode(languageCode);
  const resolvedVoiceName = normalizeVoiceName(voiceName, resolvedLanguageCode);
  if (!resolvedVoiceName) {
    return {
      text: normalizedText,
      language: resolvedLanguageCode,
      voice: "",
      ttsHash: "",
      audioUrl: "",
      audioStatus: "error",
      wordTimings: [],
    };
  }

  const resolvedSpeakingRate = Number(speakingRate || env.GOOGLE_TTS_SPEAKING_RATE || 0.9);
  const cacheKey = createTtsCacheKey({
    text: normalizedText,
    voiceName: resolvedVoiceName,
    languageCode: resolvedLanguageCode,
    speakingRate: resolvedSpeakingRate,
    includeWordTimings,
  });
  const ttsHash = createStableTtsHash({
    text: normalizedText,
    languageCode: resolvedLanguageCode,
    voiceName: resolvedVoiceName,
  });
  const spaces = getSpacesConfig();
  const objectKey = spaces
    ? createTtsObjectKey({ languageCode: resolvedLanguageCode, voiceName: resolvedVoiceName, ttsHash })
    : "";
  const audioUrl = spaces ? `${spaces.publicBaseUrl}/${objectKey}` : "";

  if (!forceRefresh) {
    const cachedByKey = await getCachedTtsAudio(cacheKey);
    if (cachedByKey?.audio_url) {
      return {
        text: normalizedText,
        language: resolvedLanguageCode,
        voice: resolvedVoiceName,
        ttsHash,
        audioUrl: cachedByKey.audio_url,
        playbackUrl: cachedByKey.audio_object_key ? createTtsPlaybackUrl(cachedByKey.audio_object_key) : "",
        audioStatus: "ready",
        wordTimings: cachedByKey.word_timings || [],
      };
    }

    const cachedBySignature = await findTtsAudioBySignature({
      ttsHash,
      languageCode: resolvedLanguageCode,
      voiceName: resolvedVoiceName,
      includeWordTimings,
    });
    if (cachedBySignature?.audio_url) {
      return {
        text: normalizedText,
        language: resolvedLanguageCode,
        voice: resolvedVoiceName,
        ttsHash,
        audioUrl: cachedBySignature.audio_url,
        playbackUrl: cachedBySignature.audio_object_key ? createTtsPlaybackUrl(cachedBySignature.audio_object_key) : "",
        audioStatus: "ready",
        wordTimings: cachedBySignature.word_timings || [],
      };
    }

    if (audioUrl && sql && await publicAudioObjectExists(audioUrl)) {
      await sql`
        INSERT INTO tts_audio_cache (
          cache_key,
          provider,
          voice_name,
          language_code,
          speaking_rate,
          include_word_timings,
          text_hash,
          tts_hash,
          normalized_text,
          audio_status,
          audio_url,
          audio_object_key,
          word_timings,
          created_at,
          last_used_at
        )
        VALUES (
          ${cacheKey},
          ${"cdn"},
          ${resolvedVoiceName},
          ${resolvedLanguageCode},
          ${String(resolvedSpeakingRate)},
          ${Boolean(includeWordTimings)},
          ${sha256(normalizedText)},
          ${ttsHash},
          ${normalizedText},
          ${"ready"},
          ${audioUrl},
          ${objectKey},
          ${JSON.stringify([])},
          NOW(),
          NOW()
        )
        ON CONFLICT (cache_key) DO UPDATE SET
          audio_url = EXCLUDED.audio_url,
          audio_object_key = EXCLUDED.audio_object_key,
          tts_hash = EXCLUDED.tts_hash,
          normalized_text = EXCLUDED.normalized_text,
          audio_status = EXCLUDED.audio_status,
          last_used_at = NOW()
      `;

      return {
        text: normalizedText,
        language: resolvedLanguageCode,
        voice: resolvedVoiceName,
        ttsHash,
        audioUrl,
        playbackUrl: createTtsPlaybackUrl(objectKey),
        audioStatus: "ready",
        wordTimings: [],
      };
    }
  }

  const generated = await synthesizeCloudTts({
    text: normalizedText,
    voiceName: resolvedVoiceName,
    languageCode: resolvedLanguageCode,
    speakingRate: resolvedSpeakingRate,
    includeWordTimings,
    preferProvider,
  });

  if (!generated?.audioContent) {
    return {
      text: normalizedText,
      language: resolvedLanguageCode,
      voice: resolvedVoiceName,
      ttsHash,
      audioUrl: "",
      audioStatus: "error",
      wordTimings: [],
    };
  }

  const stored = await storeTtsAudio({
    cacheKey,
    text: normalizedText,
    provider: generated.provider,
    audioContent: generated.audioContent,
    voiceName: resolvedVoiceName,
    languageCode: resolvedLanguageCode,
    speakingRate: resolvedSpeakingRate,
    includeWordTimings,
    wordTimings: generated.wordTimings || [],
  });

  return {
    text: normalizedText,
    language: stored?.languageCode || resolvedLanguageCode,
    voice: stored?.voiceName || resolvedVoiceName,
    ttsHash: stored?.ttsHash || ttsHash,
    audioUrl: stored?.audioUrl || "",
    playbackUrl: stored?.objectKey ? createTtsPlaybackUrl(stored.objectKey) : "",
    audioStatus: stored?.audioUrl ? "ready" : "error",
    wordTimings: generated.wordTimings || [],
  };
}

async function getExistingTtsCacheEntry({
  text,
  languageCode,
  voiceName,
  speakingRate,
  includeWordTimings = false,
  forceRefresh = false,
}) {
  const normalizedText = normalizeTtsText(text);
  if (!normalizedText) return null;

  const resolvedLanguageCode = normalizeLanguageCode(languageCode);
  const resolvedVoiceName = normalizeVoiceName(voiceName, resolvedLanguageCode);
  if (!resolvedVoiceName) return null;

  const resolvedSpeakingRate = Number(speakingRate || env.GOOGLE_TTS_SPEAKING_RATE || 0.9);
  const cacheKey = createTtsCacheKey({
    text: normalizedText,
    voiceName: resolvedVoiceName,
    languageCode: resolvedLanguageCode,
    speakingRate: resolvedSpeakingRate,
    includeWordTimings,
  });
  const ttsHash = createStableTtsHash({
    text: normalizedText,
    languageCode: resolvedLanguageCode,
    voiceName: resolvedVoiceName,
  });
  const spaces = getSpacesConfig();
  const objectKey = spaces
    ? createTtsObjectKey({ languageCode: resolvedLanguageCode, voiceName: resolvedVoiceName, ttsHash })
    : "";
  const audioUrl = spaces ? `${spaces.publicBaseUrl}/${objectKey}` : "";

  if (forceRefresh) return null;

  const cachedByKey = await getCachedTtsAudio(cacheKey);
  if (cachedByKey?.audio_url) {
    return {
      text: normalizedText,
      language: resolvedLanguageCode,
      voice: resolvedVoiceName,
      ttsHash,
      audioUrl: cachedByKey.audio_url,
      playbackUrl: cachedByKey.audio_object_key ? createTtsPlaybackUrl(cachedByKey.audio_object_key) : "",
      audioStatus: "ready",
      wordTimings: cachedByKey.word_timings || [],
    };
  }

  const cachedBySignature = await findTtsAudioBySignature({
    ttsHash,
    languageCode: resolvedLanguageCode,
    voiceName: resolvedVoiceName,
    includeWordTimings,
  });
  if (cachedBySignature?.audio_url) {
    return {
      text: normalizedText,
      language: resolvedLanguageCode,
      voice: resolvedVoiceName,
      ttsHash,
      audioUrl: cachedBySignature.audio_url,
      playbackUrl: cachedBySignature.audio_object_key ? createTtsPlaybackUrl(cachedBySignature.audio_object_key) : "",
      audioStatus: "ready",
      wordTimings: cachedBySignature.word_timings || [],
    };
  }

  if (audioUrl && sql && await publicAudioObjectExists(audioUrl)) {
    await sql`
      INSERT INTO tts_audio_cache (
        cache_key,
        provider,
        voice_name,
        language_code,
        speaking_rate,
        include_word_timings,
        text_hash,
        tts_hash,
        normalized_text,
        audio_status,
        audio_url,
        audio_object_key,
        word_timings,
        created_at,
        last_used_at
      )
      VALUES (
        ${cacheKey},
        ${"cdn"},
        ${resolvedVoiceName},
        ${resolvedLanguageCode},
        ${String(resolvedSpeakingRate)},
        ${Boolean(includeWordTimings)},
        ${sha256(normalizedText)},
        ${ttsHash},
        ${normalizedText},
        ${"ready"},
        ${audioUrl},
        ${objectKey},
        ${JSON.stringify([])},
        NOW(),
        NOW()
      )
      ON CONFLICT (cache_key) DO UPDATE SET
        audio_url = EXCLUDED.audio_url,
        audio_object_key = EXCLUDED.audio_object_key,
        tts_hash = EXCLUDED.tts_hash,
        normalized_text = EXCLUDED.normalized_text,
        audio_status = EXCLUDED.audio_status,
        last_used_at = NOW()
    `;

    return {
      text: normalizedText,
      language: resolvedLanguageCode,
      voice: resolvedVoiceName,
      ttsHash,
      audioUrl,
      playbackUrl: createTtsPlaybackUrl(objectKey),
      audioStatus: "ready",
      wordTimings: [],
    };
  }

  return null;
}

function scheduleTtsCacheGeneration(params) {
  const normalizedText = normalizeTtsText(params?.text);
  if (!normalizedText) return;
  const resolvedLanguageCode = normalizeLanguageCode(params?.languageCode);
  const resolvedVoiceName = normalizeVoiceName(params?.voiceName, resolvedLanguageCode);
  const jobKey = `${normalizedText}::${resolvedLanguageCode}::${resolvedVoiceName}::${Boolean(params?.includeWordTimings)}`;

  if (ttsGenerationJobs.has(jobKey)) return;

  const job = ensureTtsCacheEntry({
    ...params,
    text: normalizedText,
    languageCode: resolvedLanguageCode,
    voiceName: resolvedVoiceName,
  }).catch(() => null).finally(() => {
    ttsGenerationJobs.delete(jobKey);
  });

  ttsGenerationJobs.set(jobKey, job);
}

async function uploadToSpaces({ endpoint, region, bucket, accessKeyId, secretAccessKey, objectKey, body, contentType, cacheControl = "" }) {
  const host = new URL(endpoint).host;
  const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
  const url = `${endpoint}/${bucket}/${encodedKey}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const canonicalUri = `/${bucket}/${encodedKey}`;
  const canonicalHeaderLines = [
    ...(cacheControl ? [`cache-control:${cacheControl}`] : []),
    `content-type:${contentType}`,
    `host:${host}`,
    "x-amz-acl:public-read",
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ];
  const canonicalHeaders = canonicalHeaderLines.join("\n") + "\n";
  const signedHeaders = [
    ...(cacheControl ? ["cache-control"] : []),
    "content-type",
    "host",
    "x-amz-acl",
    "x-amz-content-sha256",
    "x-amz-date",
  ].join(";");
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = hmac(signingKey, stringToSign, "hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      ...(cacheControl ? { "Cache-Control": cacheControl } : {}),
      "Content-Type": contentType,
      "x-amz-acl": "public-read",
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
    body,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Spaces upload failed (${response.status}): ${message.slice(0, 200)}`);
  }
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

async function explainPhrase(phraseText, preferredProvider, sentenceContext = "", strictProvider = false, googleTranslation = "") {
  const hasContext = Boolean(String(sentenceContext || "").trim());
  const translationHint = String(googleTranslation || "").trim();
  const userPrompt = hasContext
    ? `Phrase: ${phraseText}\nSubtitle context: ${sentenceContext}${translationHint ? `\nGoogle Somali translation hint: ${translationHint}\nUse this hint to stay aligned with the intended Somali meaning, but still explain the English word naturally.` : ""}`
    : `Phrase: ${phraseText}\nNo subtitle context is provided. Explain this word or phrase generally. Do not mention subtitle context, videos, speakers, scenes, "here", or "in this sentence".${translationHint ? `\nGoogle Somali translation hint: ${translationHint}\nUse this hint to stay aligned with the intended Somali meaning, but still explain the English word naturally and include a few close Somali glosses when helpful.` : ""}`;
  const result = strictProvider && preferredProvider && preferredProvider !== "auto"
    ? {
        ...(await requestJsonFromSingleProvider({
          provider: preferredProvider,
          systemPrompt: SYSTEM_PROMPT,
          userPrompt,
        })),
        aiProvider: preferredProvider,
        aiProviderLabel: getProviderLabel(preferredProvider),
        aiModel: getAiHealth(preferredProvider).model,
      }
    : await requestJsonFromProviders({
        preferredProvider,
        task: "lookup",
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        includeProviderMeta: true,
      });

  return normalizeAiResult(result);
}

function getRecommendedProviderForSavedPhrase({ phraseText, phraseType, difficultyLevel }) {
  const text = String(phraseText || "").trim();
  const type = String(phraseType || "word");
  const isPhrase = /\s/.test(text) || type === "idiom" || type === "phrasal_verb" || type === "expression";
  const isHardWord = type === "word" && (text.length >= 12 || /[-']/g.test(text));
  return isPhrase || isHardWord || difficultyLevel === "advanced" ? "gemini" : "deepseek";
}

function buildPhraseExplanationFromAiResult(aiResult, phraseId, previousExplanation = null) {
  return {
    id: previousExplanation?.id || crypto.randomUUID(),
    phraseId,
    standardMeaning: aiResult.standardMeaning || "",
    easyMeaning: aiResult.easyMeaning || "",
    aiExplanation: aiResult.aiExplanation || "",
    usageContext: aiResult.usageContext || "",
    somaliMeaning: aiResult.somaliMeaning || "",
    partOfSpeech: aiResult.partOfSpeech || "",
    somaliExplanation: aiResult.somaliExplanation || "",
    somaliSentence: aiResult.somaliSentence || "",
    somaliSentenceTranslation: aiResult.somaliSentenceTranslation || "",
    usageNote: aiResult.usageNote || "",
    contextNote: aiResult.contextNote || "",
    commonMistake: aiResult.commonMistake || "",
    pronunciationText: aiResult.pronunciationText || "",
    relatedPhrases: Array.isArray(aiResult.relatedPhrases) ? aiResult.relatedPhrases : [],
    googleTranslation: previousExplanation?.googleTranslation,
    googleTranslationUpdatedAt: previousExplanation?.googleTranslationUpdatedAt,
    aiProvider: aiResult.aiProvider || "",
    aiProviderLabel: aiResult.aiProviderLabel || "",
    aiModel: aiResult.aiModel || "",
  };
}

function buildPhraseExamplesFromAiResult(aiResult, phraseId) {
  return (Array.isArray(aiResult.examples) ? aiResult.examples : []).map((example) => ({
    id: crypto.randomUUID(),
    phraseId,
    exampleText: example.text || "",
    exampleType: normalizeExampleType(example.type),
    translationText: example.translation || "",
  }));
}

async function enrichSavedExtensionPhrase({ phraseId, phraseText, provider, previousExplanation }) {
  try {
    const aiResult = await explainPhrase(phraseText, provider, "", true);
    const existing = existsSync(EXT_PHRASES_FILE)
      ? JSON.parse(readFileSync(EXT_PHRASES_FILE, "utf8"))
      : [];
    const index = existing.findIndex((phrase) => phrase?.id === phraseId);
    if (index === -1) {
      return;
    }

    const phrase = existing[index];
    const updatedPhrase = {
      ...phrase,
      phraseType: aiResult?.phraseType || phrase.phraseType || "word",
      explanation: buildPhraseExplanationFromAiResult(aiResult, phraseId, previousExplanation || phrase.explanation),
      examples: buildPhraseExamplesFromAiResult(aiResult, phraseId),
      updatedAt: new Date().toISOString(),
    };

    existing[index] = updatedPhrase;
    writeFileSync(EXT_PHRASES_FILE, JSON.stringify(existing, null, 2));
  } catch (error) {
    console.warn("Extension save background enrichment failed:", error instanceof Error ? error.message : error);
  }
}

function buildWordPrompt(word, sentenceContext = "") {
  const context = String(sentenceContext || "").trim();
  if (context) {
    return `Word: ${word}\nSubtitle context: ${context}`;
  }
  return `Word: ${word}\nNo subtitle context is provided. Explain the word generally. Do not mention subtitle context, videos, speakers, scenes, "here", or "in this sentence".`;
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
    task: "bulk",
    systemPrompt: RANDOM_PHRASES_SYSTEM_PROMPT,
    userPrompt: `Return ${count} useful phrase entries. ${filterText} ${excludeText}`,
  });

  return normalizePhraseEntries(result);
}

async function getExtensionWordInsights({ word, sentenceContext, preferredProvider }) {
  const result = await requestJsonFromProviders({
    preferredProvider,
    task: "lookup",
    systemPrompt: EXTENSION_WORD_INSIGHTS_SYSTEM_PROMPT,
    userPrompt: buildWordPrompt(word, sentenceContext),
  });

  return normalizeExtensionWordInsights(result, { word, sentenceContext });
}

async function getExtensionWordAiExplanation({ word, sentenceContext, preferredProvider }) {
  const result = await requestJsonFromProviders({
    preferredProvider,
    task: "lookup",
    systemPrompt: EXTENSION_WORD_AI_EXPLANATION_SYSTEM_PROMPT,
    userPrompt: buildWordPrompt(word, sentenceContext),
  });

  return {
    aiExplanation: stringOrFallback(result?.aiExplanation, ""),
  };
}

async function getExtensionSomaliSupport({ word, sentenceContext, preferredProvider, strictProvider = false }) {
  const provider = preferredProvider || (getDeepSeekApiKey() ? "deepseek" : "auto");
  const userPrompt = buildWordPrompt(word, sentenceContext).replace(/^Word:/, "English word:");
  const result = strictProvider && provider !== "auto"
    ? {
        ...(await requestJsonFromSingleProvider({
          provider,
          systemPrompt: EXTENSION_SOMALI_SUPPORT_SYSTEM_PROMPT,
          userPrompt,
        })),
        aiProvider: provider,
        aiProviderLabel: getProviderLabel(provider),
        aiModel: getAiHealth(provider).model,
      }
    : await requestJsonFromProviders({
        preferredProvider: provider,
        task: "bulk",
        systemPrompt: EXTENSION_SOMALI_SUPPORT_SYSTEM_PROMPT,
        userPrompt,
        includeProviderMeta: true,
      });

  return {
    somaliMeaning: stringOrFallback(result?.somaliMeaning, ""),
    partOfSpeech: stringOrFallback(result?.partOfSpeech, ""),
    somaliExplanation: stringOrFallback(result?.somaliExplanation, ""),
    usageNote: stringOrFallback(result?.usageNote, ""),
    somaliSentence: stringOrFallback(result?.somaliSentence, ""),
    sentenceTranslation: stringOrFallback(result?.sentenceTranslation, ""),
    contextNote: stringOrFallback(result?.contextNote, ""),
    aiProvider: stringOrFallback(result?.aiProvider, provider),
    aiProviderLabel: stringOrFallback(result?.aiProviderLabel, getProviderLabel(provider)),
    aiModel: stringOrFallback(result?.aiModel, getAiHealth(provider).model),
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
    task: "bulk",
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

const DIRECT_AI_PROVIDERS = ["gemini", "gemini-lite", "deepseek", "grok", "openrouter", "cerebras", "antigravity", "glm4", "nvidia"];
const SELECTABLE_AI_PROVIDERS = ["auto", ...DIRECT_AI_PROVIDERS];

const AUTO_PROVIDER_CHAINS = {
  lookup: ["nvidia", "glm4", "deepseek", "gemini-lite", "gemini", "openrouter", "cerebras", "grok", "antigravity"],
  bulk: ["deepseek", "nvidia", "glm4", "gemini-lite", "gemini", "openrouter", "cerebras", "grok", "antigravity"],
  google: ["gemini-lite", "gemini", "glm4", "deepseek", "openrouter", "cerebras", "grok", "antigravity"],
};

function getGeminiModel() {
  return env.GEMINI_MODEL || "gemini-2.5-flash";
}

function getGeminiLiteModel() {
  return env.GEMINI_LITE_MODEL || "gemini-2.5-flash-lite";
}

function getDeepSeekApiKey() {
  return env.DEEPSEEK_API_KEY || "";
}

function getDeepSeekModel() {
  return env.DEEPSEEK_MODEL || "deepseek-chat";
}

function getDeepSeekBaseUrl() {
  return String(env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").trim().replace(/\/$/, "");
}

async function generateTextWithGemini(systemPrompt, userPrompt, model = getGeminiModel()) {
  const apiKey = env.GEMINI_API_KEY;

  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in .env.local");

  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
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

async function requestTextFromProviders({ preferredProvider, systemPrompt, userPrompt, task = "lookup" }) {
  const providers = getProviderChain(preferredProvider, task);
  const errors = [];

  for (const provider of providers) {
    try {
      // Use text-mode (no JSON mime type) for all providers
      if (provider === "gemini") return await generateTextWithGemini(systemPrompt, userPrompt, getGeminiModel());
      if (provider === "gemini-lite") return await generateTextWithGemini(systemPrompt, userPrompt, getGeminiLiteModel());
      if (provider === "deepseek") return await explainWithDeepSeekPrompt(systemPrompt, userPrompt);
      if (provider === "grok") return await explainWithGrokPrompt(systemPrompt, userPrompt);
      if (provider === "openrouter") return await explainWithOpenRouterPrompt(systemPrompt, userPrompt);
      if (provider === "cerebras") return await explainWithCerebrasPrompt(systemPrompt, userPrompt);
      if (provider === "antigravity") return await explainWithAntigravityPrompt(systemPrompt, userPrompt);
      if (provider === "glm4") return await explainWithGlm4Prompt(systemPrompt, userPrompt);
      if (provider === "nvidia") return await explainWithNvidiaGlm5Prompt(systemPrompt, userPrompt);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider error";
      errors.push({ provider, message: summarizeProviderError(provider, message) });
    }
  }

  throw new Error(summarizeCombinedProviderErrors(errors));
}

function normalizePreferredProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  return SELECTABLE_AI_PROVIDERS.includes(provider) ? provider : undefined;
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
  const envProvider = normalizePreferredProvider(env.AI_PROVIDER) || "auto";
  const provider = normalizePreferredProvider(preferredProvider) || envProvider;

  if (provider === "auto") {
    const lookupChain = getProviderChain("auto", "lookup", { throwIfEmpty: false });
    const bulkChain = getProviderChain("auto", "bulk", { throwIfEmpty: false });
    const googleChain = getProviderChain("auto", "google", { throwIfEmpty: false });

    return {
      provider,
      model: `lookup: ${lookupChain[0] || "none"} / bulk: ${bulkChain[0] || "none"} / google: ${googleChain[0] || "none"}`,
      configured: lookupChain.length > 0 || bulkChain.length > 0 || googleChain.length > 0,
    };
  }

  if (provider === "gemini") {
    return {
      provider,
      model: getGeminiModel(),
      configured: Boolean(env.GEMINI_API_KEY),
    };
  }

  if (provider === "gemini-lite") {
    return {
      provider,
      model: getGeminiLiteModel(),
      configured: Boolean(env.GEMINI_API_KEY),
    };
  }

  if (provider === "deepseek") {
    return {
      provider,
      model: getDeepSeekModel(),
      configured: Boolean(getDeepSeekApiKey()),
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

  if (provider === "glm4") {
    return {
      provider,
      model: getGlm4Model(),
      configured: Boolean(getGlm4ApiKey()),
    };
  }

  if (provider === "nvidia") {
    return {
      provider,
      model: getNvidiaModel(),
      configured: Boolean(getNvidiaApiKey()),
    };
  }

  return {
    provider: provider || "unset",
    model: "unset",
    configured: false,
  };
}

function getProviderChain(preferredProvider, task = "lookup", options = {}) {
  const normalizedPreferred = normalizePreferredProvider(preferredProvider);
  const envProvider = normalizePreferredProvider(env.AI_PROVIDER) || "auto";
  const selectedProvider = normalizedPreferred || envProvider;
  const fallbackChain = AUTO_PROVIDER_CHAINS[task] || AUTO_PROVIDER_CHAINS.lookup;
  const orderedProviders = selectedProvider && selectedProvider !== "auto"
    ? [selectedProvider, ...fallbackChain.filter((provider) => provider !== selectedProvider)]
    : fallbackChain;
  const configuredProviders = [];

  for (const provider of orderedProviders) {
    if (!DIRECT_AI_PROVIDERS.includes(provider)) continue;
    if (configuredProviders.includes(provider)) continue;

    if (provider === "gemini" && env.GEMINI_API_KEY) {
      configuredProviders.push(provider);
      continue;
    }

    if (provider === "gemini-lite" && env.GEMINI_API_KEY) {
      configuredProviders.push(provider);
      continue;
    }

    if (provider === "deepseek" && getDeepSeekApiKey()) {
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

    if (provider === "glm4" && getGlm4ApiKey()) {
      configuredProviders.push(provider);
      continue;
    }

    if (provider === "nvidia" && getNvidiaApiKey()) {
      configuredProviders.push(provider);
      continue;
    }
  }

  if (configuredProviders.length === 0) {
    if (options.throwIfEmpty === false) return [];
    throw new Error("No AI provider is configured. Add GLM4_API_KEY, DEEPSEEK_API_KEY, GEMINI_API_KEY, ANTIGRAVITY_API_KEY, XAI_API_KEY, OPENROUTER_API_KEY, or CEREBRAS_API_KEY to .env.local");
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

async function requestJsonFromProviders({ preferredProvider, systemPrompt, userPrompt, task = "lookup", includeProviderMeta = false }) {
  const providers = getProviderChain(preferredProvider, task);
  const errors = [];

  for (const provider of providers) {
    try {
      let parsed;
      if (provider === "gemini") {
        parsed = parseModelJson(await explainWithGeminiPrompt(systemPrompt, userPrompt, getGeminiModel()));
      } else if (provider === "gemini-lite") {
        parsed = parseModelJson(await explainWithGeminiPrompt(systemPrompt, userPrompt, getGeminiLiteModel()));
      } else if (provider === "deepseek") {
        parsed = parseModelJson(await explainWithDeepSeekPrompt(systemPrompt, userPrompt));
      } else if (provider === "grok") {
        parsed = parseModelJson(await explainWithGrokPrompt(systemPrompt, userPrompt));
      } else if (provider === "openrouter") {
        parsed = parseModelJson(await explainWithOpenRouterPrompt(systemPrompt, userPrompt));
      } else if (provider === "cerebras") {
        parsed = parseModelJson(await explainWithCerebrasPrompt(systemPrompt, userPrompt));
      } else if (provider === "antigravity") {
        parsed = parseModelJson(await explainWithAntigravityPrompt(systemPrompt, userPrompt));
      } else if (provider === "glm4") {
        parsed = parseModelJson(await explainWithGlm4Prompt(systemPrompt, userPrompt));
      } else if (provider === "nvidia") {
        parsed = parseModelJson(await explainWithNvidiaGlm5Prompt(systemPrompt, userPrompt));
      }

      if (parsed && includeProviderMeta && typeof parsed === "object" && !Array.isArray(parsed)) {
        return {
          ...parsed,
          aiProvider: provider,
          aiProviderLabel: getProviderLabel(provider),
          aiModel: getAiHealth(provider).model,
        };
      }

      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider error";
      errors.push({ provider, message: summarizeProviderError(provider, message) });
    }
  }

  throw new Error(summarizeCombinedProviderErrors(errors));
}

async function requestJsonFromSingleProvider({ provider, systemPrompt, userPrompt }) {
  if (provider === "gemini") {
    return parseModelJson(await explainWithGeminiPrompt(systemPrompt, userPrompt, getGeminiModel()));
  }

  if (provider === "gemini-lite") {
    return parseModelJson(await explainWithGeminiPrompt(systemPrompt, userPrompt, getGeminiLiteModel()));
  }

  if (provider === "deepseek") {
    return parseModelJson(await explainWithDeepSeekPrompt(systemPrompt, userPrompt));
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

  if (provider === "glm4") {
    return parseModelJson(await explainWithGlm4Prompt(systemPrompt, userPrompt));
  }

  if (provider === "nvidia") {
    return parseModelJson(await explainWithNvidiaGlm5Prompt(systemPrompt, userPrompt));
  }

  throw new Error("Unknown provider");
}

function getProviderLabel(provider) {
  return provider === "auto"
    ? "Auto"
    : provider === "gemini"
    ? "Gemini"
    : provider === "gemini-lite"
      ? "Gemini 2.5 Flash-Lite"
      : provider === "deepseek"
      ? "DeepSeek V3.2"
      : provider === "grok"
      ? "Grok"
      : provider === "openrouter"
        ? "OpenRouter"
        : provider === "cerebras"
          ? "Cerebras"
          : provider === "antigravity"
            ? "Antigravity"
            : provider === "glm4"
            ? "GLM-4-Flash"
            : provider === "nvidia"
            ? "GLM-5.1 (NVIDIA)"
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
    lower.includes("temporarily rate-limited upstream") ||
    lower.includes('"code":429') ||
    lower.includes("429")
  ) {
    if (provider === "openrouter" && lower.includes("temporarily rate-limited upstream")) {
      return `${providerLabel} free upstream model is rate-limited`;
    }
    return `${providerLabel} quota reached`;
  }

  if (lower.includes("timed out")) {
    return `${providerLabel} timed out`;
  }

  if (
    lower.includes("doesn't have any credits") ||
    lower.includes("does not have any credits") ||
    lower.includes("no credits") ||
    lower.includes("credits or licenses") ||
    lower.includes("purchase those")
  ) {
    return `${providerLabel} needs credits or a license`;
  }

  if (
    lower.includes("unauthorized") ||
    lower.includes("invalid api key") ||
    lower.includes("api_key_invalid") ||
    lower.includes("api key expired") ||
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

async function fetchWithTimeout(url, options = {}, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getGlm4ApiKey() {
  return env.GLM4_API_KEY || env.ZAI_API_KEY || "";
}

function getGlm4Model() {
  const configuredModel = String(env.GLM4_MODEL || env.ZAI_MODEL || "").trim();
  if (!configuredModel || configuredModel === "glm-4-flash") return "glm-4.7-flash";
  return configuredModel;
}

function getGlm4BaseUrls() {
  const configuredBaseUrl = String(env.GLM4_BASE_URL || env.ZAI_BASE_URL || "").trim().replace(/\/$/, "");

  if (configuredBaseUrl) {
    return [configuredBaseUrl];
  }

  return [
    "https://open.bigmodel.cn/api/paas/v4",
    "https://api.z.ai/api/paas/v4",
  ];
}

async function explainWithGeminiPrompt(systemPrompt, userPrompt, model = getGeminiModel()) {
  const apiKey = env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in .env.local");
  }

  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
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

async function explainWithDeepSeekPrompt(systemPrompt, userPrompt) {
  const apiKey = getDeepSeekApiKey();
  const model = getDeepSeekModel();
  const baseUrl = getDeepSeekBaseUrl();

  if (!apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY in .env.local");
  }

  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
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
      max_tokens: 1200,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek request failed: ${errorText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("DeepSeek returned an empty response");
  }

  return text;
}

async function explainWithGrokPrompt(systemPrompt, userPrompt) {
  const apiKey = env.XAI_API_KEY;
  const model = env.XAI_MODEL || "grok-4-fast-reasoning";

  if (!apiKey) {
    throw new Error("Missing XAI_API_KEY in .env.local");
  }

  const response = await fetchWithTimeout("https://api.x.ai/v1/chat/completions", {
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

  const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
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

  const response = await fetchWithTimeout("https://api.cerebras.ai/v1/chat/completions", {
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

  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
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

async function explainWithGlm4Prompt(systemPrompt, userPrompt) {
  const apiKey = getGlm4ApiKey();
  const model = getGlm4Model();

  if (!apiKey) {
    throw new Error("Missing GLM4_API_KEY or ZAI_API_KEY in .env");
  }

  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    thinking: { type: "disabled" },
    temperature: 0.2,
    max_tokens: 1200,
  };
  const baseUrls = getGlm4BaseUrls();
  let lastError = "";
  let response = null;

  for (const baseUrl of baseUrls) {
    response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) break;
    lastError = await response.text();
    if ([401, 403, 429].includes(response.status)) break;
  }

  if (!response?.ok) {
    throw new Error(`GLM-4-Flash request failed: ${lastError}`);
  }

  const data = await response.json();
  const msg = data?.choices?.[0]?.message;
  const text = msg?.content || msg?.reasoning_content;

  if (!text) {
    throw new Error("GLM-4-Flash returned an empty response");
  }

  return text;
}

function getNvidiaApiKey() {
  return String(env.NVIDIA_API_KEY || "").trim();
}

function getNvidiaModel() {
  return String(env.NVIDIA_GLM_MODEL || "z-ai/glm-5.1").trim();
}

function getNvidiaBaseUrl() {
  return String(env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").trim().replace(/\/$/, "");
}

async function explainWithNvidiaGlm5Prompt(systemPrompt, userPrompt) {
  const apiKey = getNvidiaApiKey();
  const model = getNvidiaModel();
  const baseUrl = getNvidiaBaseUrl();

  if (!apiKey) {
    throw new Error("Missing NVIDIA_API_KEY in .env");
  }

  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
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
      max_tokens: 1200,
      top_p: 1,
      // Disable thinking mode for fast responses — GLM 5.1 is still higher
      // quality than 4.7 even without reasoning enabled
      chat_template_kwargs: { enable_thinking: false },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NVIDIA GLM-5.1 request failed: ${errorText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("NVIDIA GLM-5.1 returned an empty response");
  }

  return text;
}

function parseModelJson(text) {
  let cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  const startsAt = [firstBrace, firstBracket].filter((index) => index >= 0).sort((a, b) => a - b)[0];

  if (startsAt > 0) {
    cleaned = cleaned.slice(startsAt);
  }

  const lastBrace = cleaned.lastIndexOf("}");
  const lastBracket = cleaned.lastIndexOf("]");
  const endsAt = Math.max(lastBrace, lastBracket);

  if (endsAt >= 0 && endsAt < cleaned.length - 1) {
    cleaned = cleaned.slice(0, endsAt + 1);
  }

  return JSON.parse(cleaned);
}

function normalizeAiResult(result) {
  const phraseType = normalizePhraseType(result?.phraseType);
  const examples = Array.isArray(result?.examples) && result.examples.length > 0
    ? result.examples.slice(0, 5).map((example) => ({
        type: normalizeExampleType(example?.type),
        text: String(example?.text || "").trim() || "Example unavailable.",
        translation: String(example?.translation || example?.translationText || "").trim(),
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
    partOfSpeech: stringOrFallback(result?.partOfSpeech, ""),
    somaliExplanation: stringOrFallback(result?.somaliExplanation, "Sharaxaad lama helin."),
    somaliSentence: stringOrFallback(result?.somaliSentence, "Tusaale lama helin."),
    somaliSentenceTranslation: stringOrFallback(result?.somaliSentenceTranslation, result?.sentenceTranslation || ""),
    usageNote: stringOrFallback(result?.usageNote, ""),
    contextNote: stringOrFallback(result?.contextNote, ""),
    commonMistake: stringOrFallback(result?.commonMistake, "No common mistake provided."),
    pronunciationText: stringOrFallback(result?.pronunciationText, "/unknown/"),
    relatedPhrases: relatedPhrases.length > 0 ? relatedPhrases : ["related phrase 1", "related phrase 2", "related phrase 3"],
    aiProvider: stringOrFallback(result?.aiProvider, ""),
    aiProviderLabel: stringOrFallback(result?.aiProviderLabel, ""),
    aiModel: stringOrFallback(result?.aiModel, ""),
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
