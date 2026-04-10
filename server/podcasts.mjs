import Parser from "rss-parser";
import sanitizeHtml from "sanitize-html";
import crypto from "crypto";

const parser = new Parser({
  customFields: {
    feed: ['podcast:transcript'],
    item: [
      ['podcast:transcript', 'podcastTranscript', { keepArray: true }],
      ['itunes:duration', 'itunesDuration'],
      ['itunes:image', 'itunesImage']
    ],
  }
});

// Polyfill randomUUID if needed
const uuid = () => crypto.randomUUID();

export async function handlePodcastRoutes(req, res, pathname, url, sql, sendJson, readJsonBody) {
  if (!sql) return false;

  // 1. Get all podcasts
  if (req.method === "GET" && pathname === "/api/podcasts") {
    try {
      const rows = await sql`SELECT * FROM podcasts ORDER BY last_synced_at DESC`;
      sendJson(res, 200, rows);
    } catch (e) {
      sendJson(res, 500, { error: String(e) });
    }
    return true;
  }

  // 2. Get podcast by ID
  const podcastIdMatch = pathname.match(/^\/api\/podcasts\/([^/]+)$/);
  if (req.method === "GET" && podcastIdMatch) {
    try {
      const podcastId = podcastIdMatch[1];
      const rows = await sql`SELECT * FROM podcasts WHERE id = ${podcastId}`;
      if (rows.length === 0) {
        sendJson(res, 404, { error: "Podcast not found" });
        return true;
      }
      sendJson(res, 200, rows[0]);
    } catch (e) {
      sendJson(res, 500, { error: String(e) });
    }
    return true;
  }

  // 3. Get episodes for a podcast
  const episodesMatch = pathname.match(/^\/api\/podcasts\/([^/]+)\/episodes$/);
  if (req.method === "GET" && episodesMatch) {
    try {
      const podcastId = episodesMatch[1];
      const page = parseInt(url.searchParams.get('page') || '1', 10);
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const offset = (page - 1) * limit;

      const rows = await sql`
        SELECT * FROM episodes 
        WHERE podcast_id = ${podcastId} 
        ORDER BY published_at DESC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `;
      sendJson(res, 200, rows);
    } catch (e) {
      sendJson(res, 500, { error: String(e) });
    }
    return true;
  }

  // 4. Import Podcasts (Seed)
  if (req.method === "POST" && pathname === "/api/admin/import-podcasts") {
    try {
      const body = await readJsonBody(req);
      const seeds = Array.isArray(body?.seeds) ? body.seeds : [];
      if (!seeds.length) {
        sendJson(res, 400, { error: "seeds array is required" });
        return true;
      }

      const results = [];
      for (const seed of seeds) {
        // Use Apple iTunes Search API as resolver
        const searchUrl = `https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(seed)}&limit=1`;
        const response = await fetch(searchUrl);
        if (!response.ok) continue;
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          const p = data.results[0];
          const feedUrl = p.feedUrl;
          if (!feedUrl) continue;
          
          let title = p.collectionName;
          let publisher = p.artistName;
          let artworkUrl = p.artworkUrl600 || p.artworkUrl100;

          const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
          const pId = uuid();
          const extId = String(p.collectionId);

          try {
            await sql`
              INSERT INTO podcasts (id, title, slug, publisher, artwork_url, source_provider, external_podcast_id, rss_feed_url)
              VALUES (${pId}, ${title}, ${slug}, ${publisher}, ${artworkUrl}, 'apple', ${extId}, ${feedUrl})
              ON CONFLICT (rss_feed_url) DO NOTHING
            `;
            results.push({ seed, status: "imported", title });
          } catch (dbErr) {
            console.error("DB error importing", seed, dbErr);
            results.push({ seed, status: "error", error: dbErr.message });
          }
        } else {
          results.push({ seed, status: "not_found" });
        }
      }

      sendJson(res, 200, { imported: results });
    } catch (e) {
      sendJson(res, 500, { error: String(e) });
    }
    return true;
  }

  // 5. Sync Feeds
  if (req.method === "POST" && pathname === "/api/admin/sync-feeds") {
    try {
      const body = await readJsonBody(req);
      const podcastId = body?.podcastId; // Optional: sync specific if provided
      let podcasts = [];
      if (podcastId) {
        podcasts = await sql`SELECT * FROM podcasts WHERE id = ${podcastId}`;
      } else {
        podcasts = await sql`SELECT * FROM podcasts ORDER BY last_synced_at ASC LIMIT 10`;
      }

      let syncedCount = 0;
      for (const podcast of podcasts) {
        try {
          const feed = await parser.parseURL(podcast.rss_feed_url);

          // Update podcast description if empty
          let description = feed.description || podcast.description;
          if (description) description = sanitizeHtml(description, { allowedTags: [] });

          await sql`
            UPDATE podcasts 
            SET description = ${description}, last_synced_at = NOW() 
            WHERE id = ${podcast.id}
          `;

          // Insert episodes
          for (const item of feed.items) {
            const extId = item.guid || item.id || item.link;
            const title = item.title || "Untitled";
            const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").concat("-", uuid().split("-")[0]);
            let epDesc = item.content || item.contentSnippet || item.description || "";
            if (epDesc) epDesc = sanitizeHtml(epDesc, { allowedTags: [] });
            
            let audioUrl = "";
            let duration = 0;
            if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith("audio/")) {
              audioUrl = item.enclosure.url;
            }
            if (item.itunesDuration) {
              const durRaw = String(item.itunesDuration);
              if (durRaw.includes(":")) {
                const parts = durRaw.split(":").map(Number);
                if (parts.length === 3) duration = parts[0]*3600 + parts[1]*60 + parts[2];
                else if (parts.length === 2) duration = parts[0]*60 + parts[1];
              } else {
                duration = parseInt(durRaw, 10);
              }
            }
            
            if (!audioUrl) continue; // Skip items with no audio

            let pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
            
            // Check transcript
            let transcriptSource = null;
            if (item.podcastTranscript && Array.isArray(item.podcastTranscript)) {
              // we have official transcripts defined
              transcriptSource = 'official_rss_feed';
            }

            try {
              await sql`
                INSERT INTO episodes (id, podcast_id, title, slug, description, published_at, duration_seconds, audio_url, external_episode_id, transcript_status, transcript_source)
                VALUES (${uuid()}, ${podcast.id}, ${title}, ${slug}, ${epDesc}, ${pubDate}, ${duration}, ${audioUrl}, ${extId}, ${transcriptSource ? 'pending' : 'none'}, ${transcriptSource})
                ON CONFLICT (external_episode_id) DO NOTHING
              `;
            } catch (epErr) {
              console.error("Episode insert error", epErr);
            }
          }
          syncedCount++;
        } catch (feedErr) {
          console.error(`Failed to sync feed ${podcast.id}`, feedErr);
        }
      }

      sendJson(res, 200, { success: true, syncedCount });
    } catch (e) {
      sendJson(res, 500, { error: String(e) });
    }
    return true;
  }

  // 6. Get single episode
  const episodeMatch = pathname.match(/^\/api\/episodes\/([^/]+)$/);
  if (req.method === "GET" && episodeMatch) {
    try {
      const episodeId = episodeMatch[1];
      const episodes = await sql`
        SELECT e.*, p.title as podcast_title, p.artwork_url as podcast_artwork 
        FROM episodes e 
        JOIN podcasts p ON e.podcast_id = p.id 
        WHERE e.id = ${episodeId}
      `;
      if (episodes.length === 0) {
        sendJson(res, 404, { error: "Episode not found" });
        return true;
      }
      sendJson(res, 200, episodes[0]);
    } catch(e) {
      sendJson(res, 500, { error: String(e) });
    }
    return true;
  }

  // 7. Get transcript segments
  const transcriptMatch = pathname.match(/^\/api\/episodes\/([^/]+)\/transcript$/);
  if (req.method === "GET" && transcriptMatch) {
    try {
      const episodeId = transcriptMatch[1];
      const episodes = await sql`SELECT transcript_status, transcript_source FROM episodes WHERE id = ${episodeId}`;
      if (episodes.length === 0) {
        sendJson(res, 404, { error: "Episode not found" });
        return true;
      }
      
      const status = episodes[0].transcript_status;
      const transcripts = await sql`SELECT id FROM transcripts WHERE episode_id = ${episodeId} ORDER BY created_at DESC LIMIT 1`;
      
      if (transcripts.length === 0) {
         sendJson(res, 200, { status, segments: [] });
         return true;
      }
      
      const segments = await sql`SELECT * FROM transcript_segments WHERE transcript_id = ${transcripts[0].id} ORDER BY sequence_number ASC`;
      sendJson(res, 200, { status: "available", segments });
    } catch(e) {
      sendJson(res, 500, { error: String(e) });
    }
    return true;
  }

  return false;
}
