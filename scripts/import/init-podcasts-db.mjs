import { env } from "node:process";
import { neon } from "@neondatabase/serverless";
import { join } from "node:path";
import { cwd } from "node:process";
import { readFileSync, existsSync } from "node:fs";

// Load .env files manually if not using a tool like dotenv
function loadEnv() {
  const root = cwd();
  const envFiles = [join(root, ".env"), join(root, ".env.local")];
  for (const file of envFiles) {
    if (existsSync(file)) {
      const content = readFileSync(file, "utf8");
      for (const line of content.split("\n")) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let val = match[2].trim();
          // Remove wrapping quotes if present
          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.substring(1, val.length - 1);
          } else if (val.startsWith("'") && val.endsWith("'")) {
            val = val.substring(1, val.length - 1);
          }
          if (!env[key]) env[key] = val;
        }
      }
    }
  }
}

loadEnv();

if (!env.DATABASE_URL) {
  console.error("No DATABASE_URL found.");
  process.exit(1);
}

const sql = neon(env.DATABASE_URL);

async function init() {
  console.log("Creating podcasts table...");
  await sql`
    CREATE TABLE IF NOT EXISTS podcasts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      publisher TEXT,
      description TEXT,
      website_url TEXT,
      artwork_url TEXT,
      language TEXT,
      source_provider TEXT,
      external_podcast_id TEXT,
      rss_feed_url TEXT UNIQUE NOT NULL,
      last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'active'
    );
  `;

  console.log("Creating episodes table...");
  await sql`
    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      podcast_id TEXT NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      published_at TIMESTAMP WITH TIME ZONE,
      duration_seconds INTEGER,
      audio_url TEXT NOT NULL,
      artwork_url TEXT,
      external_episode_id TEXT UNIQUE,
      transcript_status TEXT DEFAULT 'none',
      transcript_source TEXT,
      last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  console.log("Creating transcripts table...");
  await sql`
    CREATE TABLE IF NOT EXISTS transcripts (
      id TEXT PRIMARY KEY,
      episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      language TEXT,
      raw_text TEXT,
      version INTEGER DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  console.log("Creating transcript_segments table...");
  await sql`
    CREATE TABLE IF NOT EXISTS transcript_segments (
      id TEXT PRIMARY KEY,
      transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
      start_ms INTEGER NOT NULL,
      end_ms INTEGER NOT NULL,
      text TEXT NOT NULL,
      sequence_number INTEGER NOT NULL
    );
  `;

  console.log("Podcast database tables created/verified successfully.");
}

init().catch((err) => {
  console.error("Init failed:", err);
  process.exit(1);
});
