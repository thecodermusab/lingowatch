import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Loader2,
} from "lucide-react";
import { TopNav } from "@/components/watch/TopNav";
import { TranscriptPanel } from "@/components/watch/TranscriptPanel";
import { VideoPlayerShell } from "@/components/watch/VideoPlayerShell";
import { SavedPhrase, TranscriptCue, TranscriptTab, WatchVideoMeta, WordInsight } from "@/components/watch/types";
import { translateText } from "@/lib/googleTranslate";

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        config: {
          videoId: string;
          height?: string;
          width?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YouTubePlayer }) => void;
            onStateChange?: (event: { data: number }) => void;
          };
        },
      ) => YouTubePlayer;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YouTubePlayer {
  destroy: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
}

interface TranscriptApiEntry {
  index: number;
  text: string;
  start: number;
  duration: number;
  translation?: string;
}

interface TranscriptApiResponse {
  transcript?: TranscriptApiEntry[];
  translationsReady?: boolean;
  detail?: string;
}

const SCRIPT_ID = "youtube-iframe-api";
const SAMPLE_VIDEO: WatchVideoMeta = {
  id: "17JGGiqmrVY",
  title: 'What is your "spark"?',
  channelTitle: "Learn English With TV Series",
  thumbnail: "https://i.ytimg.com/vi/17JGGiqmrVY/hqdefault.jpg",
};
const TRANSLATION_POLL_DELAY_MS = 1500;
const TRANSLATION_POLL_MAX_ATTEMPTS = 60;

function decodeHtml(input: string): string {
  if (typeof window === "undefined") return input;
  const parser = new DOMParser();
  return parser.parseFromString(input, "text/html").documentElement.textContent || input;
}

function buildVideoMeta(searchParams: URLSearchParams): WatchVideoMeta {
  return {
    id: searchParams.get("v") || SAMPLE_VIDEO.id,
    title: searchParams.get("title") || SAMPLE_VIDEO.title,
    channelTitle: searchParams.get("channel") || SAMPLE_VIDEO.channelTitle,
    thumbnail: searchParams.get("thumb") || SAMPLE_VIDEO.thumbnail,
  };
}

function getActiveCue(cues: TranscriptCue[], currentTime: number) {
  return cues.find((cue) => currentTime >= cue.start && currentTime < cue.end) ?? cues[cues.length - 1] ?? null;
}

function normalizeTranscriptEntries(entries: TranscriptApiEntry[]): TranscriptCue[] {
  return entries.map((entry, index) => {
    const next = entries[index + 1];
    const end = next?.start ?? entry.start + Math.max(entry.duration, 2.5);

    return {
      id: `cue-${entry.index}`,
      start: entry.start,
      end,
      text: decodeHtml(entry.text),
      translation: decodeHtml(entry.translation || ""),
    };
  });
}

function buildWordInsights(cues: TranscriptCue[]): WordInsight[] {
  const frequency = new Map<string, number>();
  const stopWords = new Set(["the", "and", "for", "that", "with", "this", "your", "from", "have", "will", "they", "them", "what", "when", "into", "through", "then", "than", "were", "about"]);

  cues.forEach((cue) => {
    cue.text
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.has(word))
      .forEach((word) => {
        frequency.set(word, (frequency.get(word) || 0) + 1);
      });
  });

  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([term, count], index) => ({
      term,
      meaning: "Subtitle vocabulary extracted from the current transcript.",
      level: index < 2 ? "B1" : index < 5 ? "B2" : "C1",
      count,
    }));
}

function buildSavedPhrases(cues: TranscriptCue[]): SavedPhrase[] {
  return cues.slice(0, 3).map((cue) => ({
    term: cue.text.split(" ").slice(0, 4).join(" "),
    note: "Saved from the active subtitle line.",
    timestamp: `${Math.floor(cue.start / 60)}:${Math.floor(cue.start % 60).toString().padStart(2, "0")}`,
  }));
}

function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT?.Player) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const existingScript = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.body.appendChild(script);

    window.onYouTubeIframeAPIReady = () => resolve();
  });
}

export default function WatchWorkspacePage() {
  const [searchParams] = useSearchParams();
  const [video, setVideo] = useState<WatchVideoMeta>(() => buildVideoMeta(searchParams));
  const [activeTab, setActiveTab] = useState<TranscriptTab>("subtitles");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(true);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [cues, setCues] = useState<TranscriptCue[]>([]);
  const [gtTranslation, setGtTranslation] = useState("");
  const gtCacheRef = useRef(new Map<string, string>());
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);

  useEffect(() => {
    setVideo(buildVideoMeta(searchParams));
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | null = null;
    let pollAttempts = 0;

    async function fetchTranscript({ showLoader, resetCues }: { showLoader: boolean; resetCues: boolean }) {
      if (showLoader) {
        setTranscriptLoading(true);
        setTranscriptError(null);
      }
      if (resetCues) {
        setCues([]);
        setTranslationLoading(false);
      }

      try {
        const response = await fetch(`/api/transcript/${encodeURIComponent(video.id)}`);
        const payload: TranscriptApiResponse = await response.json();

        if (!response.ok) {
          throw new Error(payload?.detail || "Transcript unavailable");
        }

        const normalized = normalizeTranscriptEntries(payload.transcript || []);
        if (!normalized.length) throw new Error("Transcript unavailable");

        if (!cancelled) {
          setCues(normalized);
        }

        const translationsReady = payload.translationsReady ?? normalized.every((cue) => Boolean(cue.translation));
        if (!cancelled) {
          setTranslationLoading(!translationsReady);
          setTranscriptLoading(false);
        }

        if (!cancelled && !translationsReady && pollAttempts < TRANSLATION_POLL_MAX_ATTEMPTS) {
          pollAttempts += 1;
          pollTimer = window.setTimeout(() => {
            void fetchTranscript({ showLoader: false, resetCues: false });
          }, TRANSLATION_POLL_DELAY_MS);
        }
      } catch (error) {
        if (!cancelled) {
          setTranscriptError(error instanceof Error ? error.message : "Transcript unavailable");
          setCues([]);
          setTranslationLoading(false);
          setTranscriptLoading(false);
        }
      }
    }

    void fetchTranscript({ showLoader: true, resetCues: true });
    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [video.id]);

  useEffect(() => {
    let cancelled = false;

    async function mountPlayer() {
      await loadYouTubeIframeApi();
      if (cancelled || !playerHostRef.current || !window.YT?.Player) return;

      playerRef.current?.destroy();
      playerHostRef.current.innerHTML = "";

      playerRef.current = new window.YT.Player(playerHostRef.current, {
        videoId: video.id,
        height: "100%",
        width: "100%",
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: (event) => {
            setPlayerReady(true);
            setDuration(event.target.getDuration());
            event.target.playVideo();
          },
          onStateChange: (event) => {
            if (!window.YT?.PlayerState) return;
            if (event.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              setAutoScrollEnabled(true);
            }
            if (event.data === window.YT.PlayerState.PAUSED) setIsPlaying(false);
          },
        },
      });
    }

    setPlayerReady(false);
    setCurrentTime(0);
    setDuration(0);
    setAutoScrollEnabled(false);
    mountPlayer();

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [video.id]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      try {
        setCurrentTime(player.getCurrentTime());
        setDuration(player.getDuration());
      } catch {
        // Ignore polling errors while the player is initializing.
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, []);

  const activeCue = useMemo(() => getActiveCue(cues, currentTime), [cues, currentTime]);

  // Translate active cue via Google Translate, with per-cue caching
  useEffect(() => {
    if (!activeCue?.text) {
      setGtTranslation("");
      return;
    }

    const cached = gtCacheRef.current.get(activeCue.id);
    if (cached !== undefined) {
      setGtTranslation(cached);
      return;
    }

    let cancelled = false;

    translateText(activeCue.text, { source: "en", target: "so" })
      .then((result) => {
        if (cancelled) return;
        gtCacheRef.current.set(activeCue.id, result);
        setGtTranslation(result);
      })
      .catch(() => {
        if (cancelled) return;
        // Fall back to server-side translation if Google Translate fails
        setGtTranslation(activeCue.translation || "");
      });

    return () => { cancelled = true; };
  }, [activeCue?.id]);
  const derivedWordInsights = useMemo(() => (cues.length > 0 ? buildWordInsights(cues) : []), [cues]);
  const derivedSavedPhrases = useMemo(() => (cues.length > 0 ? buildSavedPhrases(cues) : []), [cues]);

  function handleSelectCue(cue: TranscriptCue) {
    playerRef.current?.seekTo(cue.start, true);
    playerRef.current?.playVideo();
    setCurrentTime(cue.start);
  }

  function handleTogglePlay() {
    const player = playerRef.current;
    if (!player) return;

    if (isPlaying) player.pauseVideo();
    else player.playVideo();
  }

  function handleSeek(time: number) {
    if (!Number.isFinite(time)) return;
    playerRef.current?.seekTo(time, true);
    setCurrentTime(time);
  }

  return (
    <div className="flex min-h-screen bg-[#111317] text-white">
      <div className="flex min-w-0 flex-1 flex-col bg-[#14181d]">
        <TopNav title={video.title} />

        <main className="grid min-h-[calc(100vh-48px)] grid-cols-1 bg-[#161a1f] xl:grid-cols-[minmax(0,56%)_minmax(0,44%)] xl:h-[calc(100vh-48px)] xl:overflow-hidden">
          <div className="flex min-h-0 flex-col">
            <VideoPlayerShell
              video={video}
              cues={cues}
              activeCue={activeCue}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              playerReady={playerReady}
              translationLoading={translationLoading}
              gtTranslation={gtTranslation}
              onTogglePlay={handleTogglePlay}
              onSeek={handleSeek}
              playerHostRef={playerHostRef}
            />

            {transcriptLoading ? (
              <div className="pointer-events-none -mt-20 flex justify-center px-4 pb-4">
                <div className="flex items-center gap-3 rounded-full border border-white/[0.08] bg-[#0f1216]/92 px-4 py-2 text-[13px] text-white/62 backdrop-blur">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading subtitles...
                </div>
              </div>
            ) : null}

            {transcriptError ? (
              <div className="border-t border-white/[0.06] px-4 py-3 text-[12px] text-white/42">
                Transcript fetch failed for this video, so subtitles and translation are unavailable right now.
              </div>
            ) : null}
          </div>

          <TranscriptPanel
            activeTab={activeTab}
            onTabChange={setActiveTab}
            cues={cues}
            activeCueId={activeCue?.id ?? null}
            onSelectCue={handleSelectCue}
            wordInsights={derivedWordInsights}
            savedPhrases={derivedSavedPhrases}
            autoScrollEnabled={autoScrollEnabled}
          />
        </main>
      </div>
    </div>
  );
}
