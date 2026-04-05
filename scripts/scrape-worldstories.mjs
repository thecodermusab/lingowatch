/**
 * Scrapes English stories from worldstories.org.uk
 * Downloads all images locally to public/world-stories/
 * Usage: node scripts/scrape-worldstories.mjs
 * Output: server/data/world-stories.json
 *
 * Re-run safe: skips stories already saved in world-stories.json
 */

import { JSDOM } from "jsdom";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";

const BASE_URL = "https://worldstories.org.uk";
const DELAY_MS = 600;

const CWD = process.cwd();
const DATA_DIR = join(CWD, "server", "data");
const COVERS_DIR = join(CWD, "public", "world-stories", "covers");
const IMAGES_DIR = join(CWD, "public", "world-stories", "images");
const OUT_PATH = join(DATA_DIR, "world-stories.json");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Load already-saved stories so we can skip them on re-run */
function loadExisting() {
  if (!existsSync(OUT_PATH)) return new Map();
  try {
    const arr = JSON.parse(readFileSync(OUT_PATH, "utf8"));
    return new Map(arr.map((s) => [s.id, s]));
  } catch {
    return new Map();
  }
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; story-archiver/1.0)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Download one image; retries once on failure. Returns true on success. */
async function downloadImage(remoteUrl, localPath) {
  if (existsSync(localPath)) return true; // already on disk

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(remoteUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; story-archiver/1.0)" },
      });
      if (!res.ok) {
        if (attempt === 1) { await sleep(800); continue; }
        return false;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) {
        if (attempt === 1) { await sleep(800); continue; }
        return false;
      }
      writeFileSync(localPath, buf);
      return true;
    } catch {
      if (attempt === 1) await sleep(800);
    }
  }
  return false;
}

async function fetchStoryList() {
  console.log("Fetching story list...");
  const html = await fetchHtml(`${BASE_URL}/lang/english`);
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const stories = [];
  doc.querySelectorAll(".book").forEach((book) => {
    const link = book.querySelector("a[href^='/reader/']");
    const img = book.querySelector("img.cover");
    const titleEl = book.querySelector(".book-title");
    if (!link) return;

    const href = link.getAttribute("href");
    const parts = href.split("/");
    const id = parts[4];
    const slug = parts[2];
    const title = titleEl ? titleEl.textContent.trim() : slug;
    const coverPath = img ? img.getAttribute("src") : `/content/book/${id}/__cover.jpg`;

    stories.push({ id, slug, title, remoteCoverUrl: `${BASE_URL}${coverPath}` });
  });

  return stories;
}

async function fetchStoryContent(slug, id) {
  const url = `${BASE_URL}/reader/${slug}/english/${id}`;
  const html = await fetchHtml(url);
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const pages = [];
  doc.querySelectorAll(".book-content").forEach((section) => {
    const pageImages = [];
    section.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || "";
      if (src.includes("Internal-Cover") || src.includes("circle-element")) return;
      if (src) pageImages.push(`${BASE_URL}${src}`);
    });

    const paragraphs = [];
    section.querySelectorAll("p").forEach((p) => {
      const text = p.textContent.trim();
      if (text) paragraphs.push(text);
    });

    if (paragraphs.length > 0 || pageImages.length > 0) {
      pages.push({ text: paragraphs.join("\n\n"), images: pageImages });
    }
  });

  const content = pages.map((p) => p.text).filter(Boolean).join("\n\n").trim();
  const remoteImages = pages.flatMap((p) => p.images);
  return { content, remoteImages };
}

async function main() {
  ensureDir(DATA_DIR);
  ensureDir(COVERS_DIR);
  ensureDir(IMAGES_DIR);

  const existing = loadExisting();
  const stories = await fetchStoryList();

  const toProcess = stories.filter((s) => !existing.has(s.id));
  const skipped = stories.length - toProcess.length;

  console.log(`Found ${stories.length} stories — ${skipped} already done, ${toProcess.length} to fetch\n`);

  // Start with what we already have
  const results = new Map(existing);

  // ── Fix any images that failed in a previous run (still pointing to remote URLs) ──
  let fixCount = 0;
  for (const entry of results.values()) {
    let changed = false;

    // Fix cover
    if (entry.coverUrl.startsWith("http")) {
      const coverExt = extname(entry.coverUrl).split("?")[0] || ".jpg";
      const localCoverPath = join(COVERS_DIR, `${entry.id}${coverExt}`);
      const ok = await downloadImage(entry.coverUrl, localCoverPath);
      if (ok) {
        entry.coverUrl = `/world-stories/covers/${entry.id}${coverExt}`;
        changed = true;
      }
    }

    // Fix story images
    if (entry.images && entry.images.some((u) => u.startsWith("http"))) {
      const storyImgDir = join(IMAGES_DIR, entry.id);
      ensureDir(storyImgDir);
      entry.images = await Promise.all(
        entry.images.map(async (url) => {
          if (!url.startsWith("http")) return url;
          const filename = basename(url.split("?")[0]);
          const localPath = join(storyImgDir, filename);
          const ok = await downloadImage(url, localPath);
          if (ok) { changed = true; return `/world-stories/images/${entry.id}/${filename}`; }
          return url;
        })
      );
    }

    if (changed) {
      fixCount++;
      results.set(entry.id, entry);
    }
  }

  if (fixCount > 0) {
    console.log(`Fixed missing images for ${fixCount} stories\n`);
    writeFileSync(OUT_PATH, JSON.stringify([...results.values()], null, 2), "utf8");
  }

  if (toProcess.length === 0) {
    console.log(`All stories already downloaded.`);
    console.log(`Done. ${results.size} stories in ${OUT_PATH}`);
    return;
  }

  for (let i = 0; i < toProcess.length; i++) {
    const story = toProcess[i];
    process.stdout.write(`[${i + 1}/${toProcess.length}] ${story.title}... `);

    try {
      const { content, remoteImages } = await fetchStoryContent(story.slug, story.id);

      // Download cover
      const coverExt = extname(story.remoteCoverUrl).split("?")[0] || ".jpg";
      const localCoverPath = join(COVERS_DIR, `${story.id}${coverExt}`);
      const coverOk = await downloadImage(story.remoteCoverUrl, localCoverPath);
      const coverUrl = coverOk
        ? `/world-stories/covers/${story.id}${coverExt}`
        : story.remoteCoverUrl;

      if (!coverOk) process.stdout.write("(cover failed) ");

      // Download story images
      const storyImgDir = join(IMAGES_DIR, story.id);
      ensureDir(storyImgDir);

      const localImages = [];
      let failedImgs = 0;
      for (const remoteUrl of remoteImages) {
        const filename = basename(remoteUrl.split("?")[0]);
        const localImgPath = join(storyImgDir, filename);
        const ok = await downloadImage(remoteUrl, localImgPath);
        if (ok) {
          localImages.push(`/world-stories/images/${story.id}/${filename}`);
        } else {
          localImages.push(remoteUrl); // fallback to remote
          failedImgs++;
        }
      }

      results.set(story.id, {
        id: story.id,
        slug: story.slug,
        title: story.title,
        coverUrl,
        content,
        images: localImages,
        source: "worldstories.org.uk",
        sourceUrl: `${BASE_URL}/reader/${story.slug}/english/${story.id}`,
      });

      const imgNote = failedImgs > 0
        ? `${localImages.length} images, ${failedImgs} failed`
        : `${localImages.length} image${localImages.length !== 1 ? "s" : ""}`;
      console.log(`done (${imgNote})`);

      // Save after every story so progress isn't lost if interrupted
      writeFileSync(OUT_PATH, JSON.stringify([...results.values()], null, 2), "utf8");
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone. ${results.size} stories saved to ${OUT_PATH}`);
  console.log(`Covers  → public/world-stories/covers/`);
  console.log(`Images  → public/world-stories/images/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
