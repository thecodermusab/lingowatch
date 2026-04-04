# LingoWatch

Chrome extension plus a small FastAPI backend for loading YouTube transcripts and showing subtitle-based vocabulary help.

## Project Layout

- `backend/` - FastAPI service used for YouTube transcript fallback
- `content.js` / `content.css` - injected learning sidebar and overlay
- `background.js` - subtitle URL capture for pages that expose caption files
- `popup.html` / `popup.js` - extension popup
- `data/frequency.json` - word-frequency buckets

## Run The Backend

1. Open Terminal.
2. Go to the backend folder:

```bash
cd /Users/maahir/Downloads/Projects/Lingowatch/backend
```

3. Install Python packages if needed:

```bash
python3 -m pip install -r requirements.txt
```

4. Start the API:

```bash
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

5. Verify it is running:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok"}
```

## Load The Extension

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select this folder:

```text
/Users/maahir/Downloads/Projects/Lingowatch
```

6. Open a YouTube video or another page with an HTML video element.
7. Click the LingoWatch extension icon.
8. Press `Toggle Sidebar`.

## Typical Dev Flow

1. Start the backend.
2. Reload the unpacked extension in `chrome://extensions`.
3. Reload the page with the video.
4. Open the sidebar from the extension popup.
5. If YouTube subtitles do not load, check that the backend is still running on `http://localhost:8000`.

## Keyboard Shortcuts

- `A` replay current line
- `D` jump to next line
- `S` toggle auto-pause

## What Improved In This Pass

- Ignored words now stay ignored after rerenders.
- Saving a custom translation no longer drops existing word metadata.
- Video subtitle syncing now uses video events instead of a continuous animation-frame loop.
- Repeated track observers are cleaned up instead of being added over and over.
- Backend transcript errors now return proper HTTP status codes.
- The manifest no longer requests the unused `scripting` permission.
