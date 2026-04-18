import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Loader2,
} from "lucide-react";
import { TopNav } from "@/components/watch/TopNav";
import { TranscriptPanel } from "@/components/watch/TranscriptPanel";
import { VideoPlayerShell } from "@/components/watch/VideoPlayerShell";
import { TranscriptCue, TranscriptTab, WatchVideoMeta } from "@/components/watch/types";
import { translateText, translateTexts } from "@/lib/googleTranslate";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { useToast } from "@/hooks/use-toast";

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
  unloadModule?: (module: string) => void;
  setOption?: (module: string, option: string, value: unknown) => void;
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
const SIDEBAR_TRANSLATION_BATCH_SIZE = 20;

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

function mergeTranscriptCues(previous: TranscriptCue[], next: TranscriptCue[]): TranscriptCue[] {
  if (!previous.length) return next;

  const previousById = new Map(previous.map((cue) => [cue.id, cue]));
  return next.map((cue) => {
    if (cue.translation) return cue;
    const previousCue = previousById.get(cue.id);
    return previousCue?.translation ? { ...cue, translation: previousCue.translation } : cue;
  });
}

function normalizeWordKey(text: string) {
  return text.replace(/[.,!?'"();:\-]/g, "").trim().toLowerCase();
}

function inferWordDifficulty(word: string) {
  if (word.length <= 5) return "beginner" as const;
  if (word.length >= 10) return "advanced" as const;
  return "intermediate" as const;
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
  const { phrases, addPhrase } = usePhraseStore();
  const { toast } = useToast();
  const [video, setVideo] = useState<WatchVideoMeta>(() => buildVideoMeta(searchParams));
  const [activeTab, setActiveTab] = useState<TranscriptTab>("subtitles");
  const [currentTime, setCurrentTime] = useState(0);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(true);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [cues, setCues] = useState<TranscriptCue[]>([]);
  const [gtTranslation, setGtTranslation] = useState("");
  const gtCacheRef = useRef(new Map<string, string>());
  const sidebarTranslationKeyRef = useRef<string | null>(null);
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const savedWordKeys = useMemo(
    () => new Set(phrases.map((phrase) => normalizeWordKey(phrase.phraseText)).filter(Boolean)),
    [phrases],
  );

  useEffect(() => {
    setVideo(buildVideoMeta(searchParams));
  }, [searchParams]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`lingowatch-watch-google-translations-${video.id}`);
      gtCacheRef.current = new Map(Object.entries(stored ? JSON.parse(stored) : {}));
    } catch {
      gtCacheRef.current = new Map();
    }
  }, [video.id]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | null = null;
    let pollAttempts = 0;
    const videoId = typeof video.id === "string" ? video.id.trim() : "";

    if (!videoId || videoId === "null" || videoId === "undefined") {
      setCues([]);
      setTranscriptLoading(false);
      setTranscriptError("Choose a video to load subtitles.");
      setTranslationLoading(false);
      return;
    }

    async function fetchTranscript({ showLoader, resetCues }: { showLoader: boolean; resetCues: boolean }) {
      if (showLoader) {
        setTranscriptLoading(true);
        setTranscriptError(null);
      }
      if (resetCues) {
        setCues([]);
        setTranslationLoading(false);
        sidebarTranslationKeyRef.current = null;
      }

      try {
        const response = await fetch(`/api/transcript/${encodeURIComponent(videoId)}`);
        const payload: TranscriptApiResponse = await response.json();

        if (!response.ok) {
          throw new Error(payload?.detail || "Transcript unavailable");
        }

        const normalized = normalizeTranscriptEntries(payload.transcript || []);
        if (!normalized.length) throw new Error("Transcript unavailable");

        if (!cancelled) {
          setCues((previous) => mergeTranscriptCues(previous, normalized));
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
    const videoId = typeof video.id === "string" ? video.id.trim() : "";

    if (!videoId || videoId === "null" || videoId === "undefined") {
      return;
    }

    async function mountPlayer() {
      await loadYouTubeIframeApi();
      if (cancelled || !playerHostRef.current || !window.YT?.Player) return;

      playerRef.current?.destroy();
      playerHostRef.current.innerHTML = "";

      playerRef.current = new window.YT.Player(playerHostRef.current, {
        videoId,
        height: "100%",
        width: "100%",
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          cc_load_policy: 0,
        },
        events: {
          onReady: (event) => {
            event.target.unloadModule?.("captions");
            event.target.unloadModule?.("cc");
            event.target.setOption?.("captions", "track", {});
            event.target.setOption?.("cc", "track", {});
            event.target.playVideo();
          },
          onStateChange: (event) => {
            if (!window.YT?.PlayerState) return;
            if (event.data === window.YT.PlayerState.PLAYING) {
              setAutoScrollEnabled(true);
            }
          },
        },
      });
    }

    setCurrentTime(0);
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
      } catch {
        // Ignore polling errors while the player is initializing.
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, []);

  const activeCue = useMemo(() => getActiveCue(cues, currentTime), [cues, currentTime]);
  const sidebarTranslationKey = useMemo(() => {
    if (!cues.length || cues.every((cue) => cue.translation)) return "";
    return `${video.id}:${cues.map((cue) => `${cue.id}:${cue.text}`).join("|")}`;
  }, [cues, video.id]);

  useEffect(() => {
    if (!sidebarTranslationKey) return;
    if (sidebarTranslationKeyRef.current === sidebarTranslationKey) return;
    const videoId = typeof video.id === "string" ? video.id.trim() : "";
    if (!videoId || videoId === "null" || videoId === "undefined") return;

    let cancelled = false;
    const sourceCues = cues.map((cue) => ({ id: cue.id, text: cue.text }));
    sidebarTranslationKeyRef.current = sidebarTranslationKey;
    setTranslationLoading(true);

    async function fetchServerSidebarTranslations() {
      const response = await fetch(`/api/transcript/${encodeURIComponent(videoId)}?translate=1`);
      const payload: TranscriptApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(payload?.detail || "Transcript translation unavailable");
      }

      return normalizeTranscriptEntries(payload.transcript || []);
    }

    async function fetchGoogleSidebarTranslations() {
      const translations: string[] = [];

      for (let index = 0; index < sourceCues.length; index += SIDEBAR_TRANSLATION_BATCH_SIZE) {
        const chunk = sourceCues.slice(index, index + SIDEBAR_TRANSLATION_BATCH_SIZE);
        const translatedChunk = await translateTexts(
          chunk.map((cue) => cue.text),
          { source: "en", target: "so" },
        );

        translations.push(...translatedChunk);
      }

      return sourceCues.map((cue, index) => ({
        id: cue.id,
        start: 0,
        end: 0,
        text: cue.text,
        translation: translations[index] || "",
      }));
    }

    async function translateSidebarCues() {
      let translatedCues: TranscriptCue[] = [];

      try {
        translatedCues = await fetchServerSidebarTranslations();
      } catch {
        translatedCues = [];
      }

      if (!translatedCues.some((cue) => cue.translation)) {
        translatedCues = await fetchGoogleSidebarTranslations();
      }

      if (cancelled) return;

      const translationsById = new Map(translatedCues.map((cue) => [cue.id, cue.translation]));
      setCues((previous) => {
        if (previous.length !== sourceCues.length) return previous;

        return previous.map((cue) => ({
          ...cue,
          translation: cue.translation || translationsById.get(cue.id) || "",
        }));
      });
      setTranslationLoading(false);
    }

    translateSidebarCues().catch(() => {
      if (!cancelled) {
        sidebarTranslationKeyRef.current = null;
        setTranslationLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sidebarTranslationKey]);

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
        localStorage.setItem(
          `lingowatch-watch-google-translations-${video.id}`,
          JSON.stringify(Object.fromEntries(gtCacheRef.current)),
        );
        setGtTranslation(result);
      })
      .catch(() => {
        if (cancelled) return;
        // Fall back to server-side translation if Google Translate fails
        setGtTranslation(activeCue.translation || "");
      });

    return () => { cancelled = true; };
  }, [activeCue?.id]);
  function handleSelectCue(cue: TranscriptCue) {
    playerRef.current?.seekTo(cue.start, true);
    playerRef.current?.playVideo();
    setCurrentTime(cue.start);
  }

  function handleSaveSubtitleWord(word: string, translation: string) {
    const cleanWord = normalizeWordKey(word);
    if (!cleanWord) return;

    if (savedWordKeys.has(cleanWord)) {
      toast({
        title: "Already saved",
        description: `"${cleanWord}" is already in your dashboard.`,
      });
      return;
    }

    void addPhrase(
      {
        phraseText: cleanWord,
        phraseType: "word",
        category: "YouTube",
        difficultyLevel: inferWordDifficulty(cleanWord),
        notes: translation || "Saved from video subtitle",
      },
      {
        phraseType: "word",
        standardMeaning: translation || cleanWord,
        easyMeaning: translation || cleanWord,
        aiExplanation: `Saved from the video subtitle: ${activeCue?.text || cleanWord}`,
        usageContext: activeCue?.text || "Saved from video subtitle",
        examples: [
          {
            type: "simple",
            text: activeCue?.text || cleanWord,
          },
        ],
        somaliMeaning: translation || "",
        somaliExplanation: translation || "",
        somaliSentence: "",
        commonMistake: "",
        pronunciationText: cleanWord,
        relatedPhrases: [],
      },
    ).then(() => {
      toast({
        title: "Word saved",
        description: `"${cleanWord}" will appear in Recent Phrases.`,
      });
    }).catch((error) => {
      toast({
        title: "Could not save word",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    });
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <TopNav title={video.title} />

        <main className="grid min-h-[calc(100vh-48px)] grid-cols-1 bg-background xl:h-[calc(100vh-48px)] xl:grid-cols-[minmax(0,56%)_minmax(0,44%)] xl:overflow-hidden">
          <div className="flex min-h-0 flex-col">
            <VideoPlayerShell
              activeCue={activeCue}
              translationLoading={translationLoading}
              gtTranslation={gtTranslation}
              savedWordKeys={savedWordKeys}
              onSaveWord={handleSaveSubtitleWord}
              playerHostRef={playerHostRef}
            />

            {transcriptLoading ? (
              <div className="pointer-events-none -mt-20 flex justify-center px-4 pb-4">
                <div className="flex items-center gap-3 rounded-full border border-border bg-card/92 px-4 py-2 text-[13px] text-muted-foreground backdrop-blur">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading subtitles...
                </div>
              </div>
            ) : null}

            {transcriptError ? (
              <div className="border-t border-border px-4 py-3 text-[12px] text-muted-foreground">
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
            autoScrollEnabled={autoScrollEnabled}
          />
        </main>
      </div>
    </div>
  );
}
