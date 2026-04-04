import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from youtube_transcript_api import (
    IpBlocked,
    NoTranscriptFound,
    RequestBlocked,
    TranscriptsDisabled,
    VideoUnavailable,
    YouTubeTranscriptApi,
)

logger = logging.getLogger("lingowatch.transcript")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/transcript/{video_id}")
def get_transcript(video_id: str, lang: str = "en"):
    try:
        api = YouTubeTranscriptApi()
        preferred_languages = [code for code in [lang, "en"] if code]

        try:
            transcript = api.fetch(video_id, languages=preferred_languages)
        except NoTranscriptFound:
            transcript_list = api.list(video_id)
            transcript_ref = None

            try:
                transcript_ref = transcript_list.find_transcript(preferred_languages)
            except NoTranscriptFound:
                pass

            if transcript_ref is None:
                try:
                    transcript_ref = transcript_list.find_manually_created_transcript(preferred_languages)
                except NoTranscriptFound:
                    pass

            if transcript_ref is None:
                try:
                    transcript_ref = transcript_list.find_generated_transcript(preferred_languages)
                except NoTranscriptFound:
                    pass

            if transcript_ref is None:
                raise

            transcript = transcript_ref.fetch()

        entries = [
            {
                "index": i,
                "text": (t.text if hasattr(t, "text") else t.get("text", "")).replace("\n", " ").strip(),
                "start": round(t.start if hasattr(t, "start") else t.get("start", 0), 2),
                "duration": round(t.duration if hasattr(t, "duration") else t.get("duration", 0), 2),
            }
            for i, t in enumerate(transcript)
            if (t.text if hasattr(t, "text") else t.get("text", "")).strip()
        ]
    except (NoTranscriptFound, TranscriptsDisabled) as exc:
        logger.info("Transcript unavailable for %s: %s", video_id, exc)
        raise HTTPException(status_code=404, detail="Transcript not available for this video") from exc
    except VideoUnavailable as exc:
        logger.info("Video unavailable for transcript fetch %s: %s", video_id, exc)
        raise HTTPException(status_code=404, detail="Video unavailable") from exc
    except (IpBlocked, RequestBlocked) as exc:
        logger.warning("Transcript backend blocked for %s: %s", video_id, exc)
        raise HTTPException(status_code=429, detail="Transcript backend blocked by YouTube for this IP") from exc
    except Exception as exc:
        logger.exception("Failed to fetch transcript for %s", video_id)
        raise HTTPException(status_code=502, detail=str(exc) or "Failed to fetch transcript") from exc

    if not entries:
        raise HTTPException(status_code=404, detail="Transcript not found")

    return {"transcript": entries}


@app.get("/health")
def health():
    return {"status": "ok"}
