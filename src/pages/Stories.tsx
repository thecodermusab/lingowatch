import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BookText, Trash2, ArrowLeft, Globe, ExternalLink, Loader2, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { SyncedTtsText, getActiveWordIndex } from "@/components/reader/SyncedTtsText";
import { TtsWordTiming } from "@/lib/tts";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeOwnerEmail } from "@/lib/accountStorage";
import { useToast } from "@/hooks/use-toast";
import { getPlayableAudioUrl } from "@/lib/ttsAssets";
import { primeAudioUrl } from "@/lib/audioPlayback";
import { loadStoredStories, saveStoredStories, StoryEntry } from "@/lib/storyStorage";
import { usePhraseStore } from "@/hooks/usePhraseStore";

// Module-level cache — survives re-renders, cleared only on page refresh
let _worldStoriesCache: WorldStory[] = [];
const WORLD_STORIES_STORAGE_KEY = "lingowatch_world_stories";

interface WorldStory {
  id: string;
  slug: string;
  title: string;
  coverUrl: string;
  content: string;
  images: string[];
  source: string;
  sourceUrl: string;
}

function loadCachedWorldStories(): WorldStory[] {
  if (_worldStoriesCache.length) return _worldStoriesCache;

  try {
    const raw = localStorage.getItem(WORLD_STORIES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      _worldStoriesCache = parsed;
      return parsed;
    }
  } catch {
    // Ignore malformed cache and fall through to empty.
  }

  return [];
}

function saveCachedWorldStories(stories: WorldStory[]) {
  _worldStoriesCache = stories;
  try {
    localStorage.setItem(WORLD_STORIES_STORAGE_KEY, JSON.stringify(stories));
  } catch {
    // Ignore cache write failures and keep the in-memory copy.
  }
}

function normalizeStoryToken(token: string) {
  return token.toLowerCase().replace(/^\W+|\W+$/g, "");
}

function renderContent(
  content: string,
  targetWords: string[] = [],
  onTargetWordClick?: (word: string) => void
) {
  const targetWordSet = new Set(targetWords.map((word) => normalizeStoryToken(word)).filter(Boolean));
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      (() => {
        const word = part.slice(2, -2);
        const normalizedWord = normalizeStoryToken(word);
        if (targetWordSet.has(normalizedWord) && onTargetWordClick) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onTargetWordClick(normalizedWord)}
              className="inline cursor-pointer bg-transparent p-0 font-semibold text-primary underline-offset-4 hover:underline"
            >
              {word}
            </button>
          );
        }
        return <strong key={i} className="font-semibold text-primary">{word}</strong>;
      })()
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

async function ensureStoryAudioAsset(story: StoryEntry): Promise<StoryEntry | null> {
  const existingUrl = getPlayableAudioUrl(story.audio);
  if (existingUrl && Array.isArray(story.wordTimings) && story.wordTimings.length) {
    return story;
  }

  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: story.content.replace(/\*\*/g, ""),
      includeWordTimings: true,
      languageCode: story.audio?.language || "en-US",
      voiceName: story.audio?.voice,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const playableUrl = String(data?.playbackUrl || data?.audioUrl || "").trim();
  if (!playableUrl) {
    return null;
  }

  return {
    ...story,
    audio: {
      text: story.content.replace(/\*\*/g, ""),
      audioUrl: typeof data?.audioUrl === "string" ? data.audioUrl : "",
      playbackUrl: typeof data?.playbackUrl === "string" ? data.playbackUrl : "",
      audioStatus: "ready",
      language: story.audio?.language || "en-US",
      voice: story.audio?.voice,
    },
    wordTimings: Array.isArray(data?.wordTimings) ? data.wordTimings : [],
  };
}

function isStoryAudioReady(story: StoryEntry) {
  return Boolean(getPlayableAudioUrl(story.audio) && Array.isArray(story.wordTimings) && story.wordTimings.length);
}

function BookCard({ story, onClick, onDelete }: { story: StoryEntry; onClick: () => void; onDelete: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:shadow-md hover:-translate-y-1"
      style={{ width: 180, height: 240 }}
      onClick={onClick}
    >
      <div className="absolute left-0 top-0 h-full w-1.5 bg-primary/60 rounded-l-2xl" />
      <div className="flex flex-1 flex-col justify-between p-5 pl-6">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {new Date(story.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
          <h3 className="mt-2 text-sm font-bold leading-snug text-foreground line-clamp-3">
            {story.title || "Untitled Story"}
          </h3>
        </div>
        <div className="flex flex-wrap gap-1">
          {story.words.slice(0, 3).map((w) => (
            <span key={w} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{w}</span>
          ))}
          {story.words.length > 3 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">+{story.words.length - 3}</span>
          )}
        </div>
      </div>
      <button
        type="button"
        className="absolute right-2 top-2 rounded-lg p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function WorldBookCard({ story, onClick }: { story: WorldStory; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);
  return (
    <div
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:shadow-md hover:-translate-y-1"
      style={{ width: 180, height: 240 }}
      onClick={onClick}
    >
      {/* Cover image */}
      {!imgError ? (
        <img
          src={story.coverUrl}
          alt={story.title}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-muted p-4">
          <Globe className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-xs font-semibold text-center text-foreground leading-snug">{story.title}</p>
        </div>
      )}

      {/* Title overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
        <p className="text-xs font-semibold text-white leading-snug line-clamp-2">{story.title}</p>
      </div>
    </div>
  );
}

function ReadingView({
  story,
  onBack,
  onDelete,
  onUpdateStory,
}: {
  story: StoryEntry;
  onBack: () => void;
  onDelete: () => void;
  onUpdateStory: (story: StoryEntry) => void;
}) {
  const { phrases } = usePhraseStore();
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wordStartsRef = useRef<number[]>([]);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null);
  const [isPreparingAudio, setIsPreparingAudio] = useState(!isStoryAudioReady(story));
  const [resumeTime, setResumeTime] = useState<number>(Math.max(0, Number(story.playbackState?.currentTime || 0)));
  const { toast } = useToast();
  const targetWords = story.words || [];
  const phraseByWord = new Map(
    phrases.map((phrase) => [normalizeStoryToken(phrase.phraseText), phrase])
  );

  const handleTargetWordClick = (word: string) => {
    if (audioRef.current) {
      persistPlaybackState(audioRef.current.currentTime);
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlayingAudio(false);
      setIsLoadingAudio(false);
      setActiveWordIndex(null);
    }
    const matchingPhrase = phraseByWord.get(normalizeStoryToken(word));
    if (!matchingPhrase) return;
    navigate(`/phrase/${matchingPhrase.id}`, { state: { fromStoryId: story.id } });
  };

  const persistPlaybackState = (currentTime: number) => {
    const safeTime = Math.max(0, Number(currentTime || 0));
    setResumeTime(safeTime);
    onUpdateStory({
      ...story,
      playbackState: {
        currentTime: safeTime,
        updatedAt: new Date().toISOString(),
      },
    });
  };

  const clearPlaybackState = () => {
    setResumeTime(0);
    onUpdateStory({
      ...story,
      playbackState: {
        currentTime: 0,
        updatedAt: new Date().toISOString(),
      },
    });
  };

  useEffect(() => {
    setResumeTime(Math.max(0, Number(story.playbackState?.currentTime || 0)));
    const existingUrl = getPlayableAudioUrl(story.audio);
    if (existingUrl) {
      primeAudioUrl(existingUrl);
    }
    setIsPreparingAudio(!isStoryAudioReady(story));

    let cancelled = false;
    void ensureStoryAudioAsset(story).then((nextStory) => {
      if (cancelled || !nextStory) return;
      const playableUrl = getPlayableAudioUrl(nextStory.audio);
      if (playableUrl) primeAudioUrl(playableUrl);
      setIsPreparingAudio(!isStoryAudioReady(nextStory));
      if (
        playableUrl !== existingUrl ||
        (nextStory.wordTimings?.length || 0) !== (story.wordTimings?.length || 0)
      ) {
        onUpdateStory(nextStory);
      }
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (audioRef.current) {
        persistPlaybackState(audioRef.current.currentTime);
      }
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [onUpdateStory, story]);

  const stopListening = () => {
    if (audioRef.current) {
      persistPlaybackState(audioRef.current.currentTime);
    }
    audioRef.current?.pause();
    audioRef.current = null;
    wordStartsRef.current = [];
    setIsPlayingAudio(false);
    setIsLoadingAudio(false);
    setActiveWordIndex(null);
  };

  const playStory = async (startAt = 0) => {
    if (isPlayingAudio || isLoadingAudio) {
      stopListening();
      return;
    }

    if (!isStoryAudioReady(story)) {
      setIsPreparingAudio(true);
      void ensureStoryAudioAsset(story).then((nextStory) => {
        if (!nextStory) return;
        onUpdateStory(nextStory);
        setIsPreparingAudio(!isStoryAudioReady(nextStory));
      }).catch(() => {}).finally(() => {
        setIsLoadingAudio(false);
      });
      toast({
        title: "Preparing audio",
        description: "Story audio is being prepared. Tap listen again in a moment.",
      });
      return;
    }

    setIsLoadingAudio(true);
    setActiveWordIndex(null);
    const playableUrl = getPlayableAudioUrl(story.audio);
    if (!playableUrl) {
      setIsLoadingAudio(false);
      toast({
        title: "Playback failed",
        description: "The cached story audio could not be found.",
        variant: "destructive",
      });
      return;
    }

    primeAudioUrl(playableUrl);

    const timings: TtsWordTiming[] = story.wordTimings || [];
    wordStartsRef.current = timings.map((timing) => timing.startTime);

    const audio = new Audio(playableUrl);
    audio.preload = "auto";
    audioRef.current = audio;
    audio.addEventListener("timeupdate", () => {
      setActiveWordIndex(getActiveWordIndex(audio.currentTime, wordStartsRef.current));
      setResumeTime(audio.currentTime);
    });
    audio.addEventListener("ended", () => {
      clearPlaybackState();
      audioRef.current?.pause();
      audioRef.current = null;
      wordStartsRef.current = [];
      setIsPlayingAudio(false);
      setIsLoadingAudio(false);
      setActiveWordIndex(null);
    });
    audio.addEventListener("error", () => {
      stopListening();
      toast({
        title: "Playback failed",
        description: "The cached story audio could not be played.",
        variant: "destructive",
      });
    });

    if (startAt > 0) {
      audio.currentTime = startAt;
      setActiveWordIndex(getActiveWordIndex(startAt, wordStartsRef.current));
    }

    setIsLoadingAudio(false);
    setIsPlayingAudio(true);
    await audio.play().catch((error) => {
      console.error("Story audio playback failed", { playableUrl, error });
      stopListening();
      toast({
        title: "Playback failed",
        description: "Story audio could not be played right now.",
        variant: "destructive",
      });
    });
  };

  return (
    <div className="app-page">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <button
          type="button"
          onClick={() => {
            if (audioRef.current) {
              persistPlaybackState(audioRef.current.currentTime);
              audioRef.current.pause();
              audioRef.current = null;
              setIsPlayingAudio(false);
              setIsLoadingAudio(false);
              setActiveWordIndex(null);
            }
            onBack();
          }}
          className="mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Stories
        </button>

        <article>
          <header className="mb-8 text-center">
            <div className="mb-3 flex flex-wrap justify-center gap-2">
              {story.words.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => handleTargetWordClick(w)}
                  className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  {w}
                </button>
              ))}
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{story.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {new Date(story.createdAt).toLocaleDateString(undefined, { dateStyle: "long" })}
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-5 gap-2"
              variant={isPlayingAudio ? "outline" : "default"}
              onClick={() => void playStory(0)}
            >
              {isLoadingAudio ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPreparingAudio ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPlayingAudio ? (
                <Square className="h-4 w-4" fill="currentColor" />
              ) : (
                <Play className="h-4 w-4" fill="currentColor" />
              )}
              {isPlayingAudio ? "Stop listening" : isPreparingAudio ? "Preparing audio" : "Listen"}
            </Button>
            {!isPlayingAudio && resumeTime > 1 ? (
              <div className="mt-3 flex justify-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void playStory(resumeTime)}>
                  Continue
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={clearPlaybackState}>
                  Restart
                </Button>
              </div>
            ) : null}
          </header>

          <div className="prose prose-lg mx-auto max-w-none text-center">
            <p className="text-lg leading-relaxed text-foreground/90">
              {isPlayingAudio || activeWordIndex !== null ? (
                <SyncedTtsText
                  text={story.content.replace(/\*\*/g, "")}
                  activeWordIndex={activeWordIndex}
                  wordClassName="transition-colors duration-100"
                  targetWords={targetWords}
                  onTargetWordClick={handleTargetWordClick}
                  targetWordClassName="font-semibold underline-offset-4 hover:underline"
                  inactiveStyle={{ color: "#888" }}
                  activeStyle={{
                    color: "#1F383C",
                    textShadow: "0 0 8px rgba(31, 56, 60, 0.85), 0 0 18px rgba(31, 56, 60, 0.45)",
                  }}
                  targetInactiveStyle={{
                    color: "#7C3AED",
                  }}
                  targetActiveStyle={{
                    color: "#B45309",
                    textShadow: "0 0 8px rgba(245, 158, 11, 0.9), 0 0 18px rgba(245, 158, 11, 0.45)",
                  }}
                />
              ) : (
                renderContent(story.content, targetWords, handleTargetWordClick)
              )}
            </p>
          </div>
        </article>

        <div className="mt-12 flex justify-center">
          <Button variant="outline" size="sm" className="gap-2 text-destructive hover:bg-destructive/10" onClick={onDelete}>
            <Trash2 className="h-4 w-4" /> Delete story
          </Button>
        </div>
      </div>
    </div>
  );
}

const PARAS_PER_PAGE = 2;

function WorldReadingView({ story, allStories, onBack, onSelect }: {
  story: WorldStory;
  allStories: WorldStory[];
  onBack: () => void;
  onSelect: (s: WorldStory) => void;
}) {
  const [page, setPage] = useState(0);
  const [finished, setFinished] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const paragraphs = story.content.split(/\n\n+/).filter((p) => p.trim() !== "*" && p.trim() !== "");

  const pages: string[][] = [];
  for (let i = 0; i < paragraphs.length; i += PARAS_PER_PAGE) {
    pages.push(paragraphs.slice(i, i + PARAS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);
  const totalPages = pages.length;

  const recommended = allStories
    .filter((s) => s.id !== story.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 6);

  useEffect(() => {
    setPage(0);
    setFinished(false);
  }, [story.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished) {
        if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "Backspace") setFinished(false);
        if (e.key === "Escape") onBack();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        if (page === totalPages - 1) setFinished(true);
        else setPage((p) => p + 1);
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") setPage((p) => Math.max(0, p - 1));
      if (e.key === "Escape" || e.key === "Backspace") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [totalPages, page, finished]);

  const allImages = [story.coverUrl, ...story.images].filter(Boolean);
  const leftImage = allImages[page % allImages.length] || story.coverUrl;

  const goBack = () => {
    if (finished) { setFinished(false); return; }
    setPage((p) => Math.max(0, p - 1));
  };
  const goNext = () => {
    if (finished) return;
    if (page === totalPages - 1) setFinished(true);
    else setPage((p) => p + 1);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goBack();
    }
    touchStartX.current = null;
  };

  if (finished) {
    return (
      <div className="relative flex min-h-screen w-full flex-col bg-background">
        {/* ── Mobile finish screen ── */}
        <div
          className="fixed inset-x-0 top-16 bottom-0 flex flex-col lg:hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="grid grid-cols-3 items-center border-b border-border px-4 py-3">
            <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <span className="text-center text-sm font-medium text-foreground/70 line-clamp-1">{story.title}</span>
            <div />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">Finished</p>
            <h2 className="mb-8 text-xl font-bold text-foreground text-center">{story.title}</h2>
            <p className="mb-5 text-sm text-muted-foreground">Read next</p>
            <div className="flex flex-wrap justify-center gap-4">
              {recommended.map((s) => (
                <div key={s.id} className="cursor-pointer" onClick={() => onSelect(s)}>
                  <div className="overflow-hidden rounded-xl shadow" style={{ width: 110, height: 148 }}>
                    <img src={s.coverUrl} alt={s.title} className="h-full w-full object-cover" />
                  </div>
                  <p className="mt-1.5 max-w-[110px] text-center text-[11px] text-muted-foreground line-clamp-2">{s.title}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-border flex items-center justify-between px-8 py-4">
            <button type="button" onClick={goBack} className="text-3xl leading-none text-white/40 hover:text-white/80 transition-colors">‹</button>
            <span className="text-xs text-muted-foreground/50">{totalPages} / {totalPages}</span>
            <div className="w-6" />
          </div>
        </div>

        {/* ── Desktop finish screen ── */}
        <div className="hidden lg:flex lg:min-h-screen lg:flex-col">
          <div className="border-b border-border" />
          <div className="flex items-center justify-between px-8 pb-3 pt-32">
            <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <span className="text-sm text-muted-foreground font-medium">{story.title}</span>
            <div className="w-[60px]" />
          </div>
          <div className="w-full pb-2 text-center text-base tracking-widest text-muted-foreground/40 select-none">*</div>
          <div className="border-b border-border" />
          <div className="flex flex-1 flex-col items-center justify-center px-8 py-12">
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">Finished</p>
            <h2 className="mb-8 text-2xl font-bold text-foreground">{story.title}</h2>
            <p className="mb-6 text-sm text-muted-foreground">Read next</p>
            <div className="flex flex-wrap justify-center gap-5">
              {recommended.map((s) => (
                <div key={s.id} className="group cursor-pointer" onClick={() => onSelect(s)}>
                  <div className="overflow-hidden rounded-xl shadow transition-all group-hover:-translate-y-1 group-hover:shadow-md" style={{ width: 140, height: 190 }}>
                    <img src={s.coverUrl} alt={s.title} className="h-full w-full object-cover" />
                  </div>
                  <p className="mt-2 max-w-[140px] text-center text-xs text-muted-foreground line-clamp-2">{s.title}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-border" />
          <div className="w-full py-3 text-center text-xs text-muted-foreground/40 select-none">
            {totalPages} / {totalPages}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-background">
      {/* ── Mobile: swipe reader ── */}
      <div
        className="fixed inset-x-0 top-16 bottom-0 flex flex-col lg:hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <span className="line-clamp-1 max-w-[55%] text-right text-sm font-medium text-foreground/70">{story.title}</span>
        </div>

        {/* Content — centered */}
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-sm">
            {page === 0 && story.coverUrl && (
              <img
                src={story.coverUrl}
                alt={story.title}
                className="mx-auto mb-5 h-44 rounded-2xl object-contain shadow-lg"
              />
            )}
            {page === 0 && (
              <h1 className="mb-6 text-center text-2xl font-bold text-foreground">{story.title}</h1>
            )}
            {pages[page]?.map((para, i) => (
              <p key={i} className="mb-4 text-base leading-relaxed text-foreground/90">{para}</p>
            ))}
          </div>
        </div>

        {/* Bottom nav bar */}
        <div className="border-t border-border flex items-center justify-between px-10 py-4">
          <button
            type="button"
            onClick={goBack}
            disabled={page === 0}
            className="text-3xl leading-none text-foreground/40 hover:text-foreground/80 disabled:opacity-20 transition-colors"
          >
            ‹
          </button>
          <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
          <button
            type="button"
            onClick={goNext}
            className="text-3xl leading-none text-foreground/40 hover:text-foreground/80 transition-colors"
          >
            ›
          </button>
        </div>
      </div>

      {/* ── Desktop: two-column book spread ── */}
      <div className="hidden lg:flex lg:min-h-screen lg:flex-col">
        <div className="border-b border-border" />
        <div className="flex items-center justify-between px-8 pb-3 pt-32">
          <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <span className="text-sm text-muted-foreground font-medium">{story.title}</span>
          <div className="w-[60px]" />
        </div>
        <div className="w-full pb-2 text-center text-base tracking-widest text-muted-foreground/40 select-none">*</div>
        <div className="border-b border-border" />

        <div className="relative flex flex-1 min-h-0 overflow-hidden">
          <button type="button" onClick={goBack} disabled={page === 0} className="absolute left-0 top-0 h-full w-14 z-10 flex items-center justify-center text-4xl text-white/30 hover:text-white/70 disabled:opacity-0 transition-all">‹</button>
          <div className="flex w-2/5 flex-col items-center justify-center gap-6 px-12 py-8">
            {page === 0 && (
              <div className="text-center">
                <h1 className="text-3xl font-bold text-white">{story.title}</h1>
                <p className="mt-2 text-sm text-white/50">An English Story</p>
              </div>
            )}
            {leftImage && (
              <img src={leftImage} alt="" className={`object-contain shadow-lg ${page === 0 ? "max-h-52 rounded-xl" : "max-h-72 rounded-xl"}`} />
            )}
          </div>
          <div className="w-px bg-white/10 self-stretch my-8" />
          <div className="flex w-3/5 flex-col justify-center overflow-y-auto px-12 py-8 pr-16">
            {pages[page]?.map((para, i) => (
              <p key={i} className="mb-6 text-[1.1rem] leading-[1.85] text-white/90">{para}</p>
            ))}
          </div>
          <button type="button" onClick={goNext} className="absolute right-0 top-0 h-full w-14 z-10 flex items-center justify-center text-4xl text-muted-foreground/30 hover:text-foreground/70 transition-all">›</button>
        </div>

        <div className="border-t border-border" />
        <div className="w-full py-3 text-center text-xs text-muted-foreground/40 select-none">
          {page + 1} / {totalPages}
        </div>
      </div>
    </div>
  );
}

export default function StoriesPage() {
  const { id, worldId } = useParams<{ id?: string; worldId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userEmail = normalizeOwnerEmail(user?.email);
  const [stories, setStories] = useState<StoryEntry[]>([]);
  const [storyToDelete, setStoryToDelete] = useState<StoryEntry | null>(null);
  const [worldStories, setWorldStories] = useState<WorldStory[]>(() => loadCachedWorldStories());
  const [worldLoading, setWorldLoading] = useState(() => loadCachedWorldStories().length === 0);
  const [activeTab, setActiveTab] = useState<"mine" | "browse">("mine");

  useEffect(() => {
    if (!userEmail) {
      setStories([]);
      return;
    }
    setStories(loadStoredStories(userEmail));
  }, [userEmail]);

  // Render cached browse stories immediately, then refresh in the background.
  useEffect(() => {
    let cancelled = false;
    setWorldLoading(worldStories.length === 0);

    fetch("/api/world-stories")
      .then((r) => r.json())
      .then((data) => {
        const stories = Array.isArray(data) ? data : [];
        if (cancelled) return;
        saveCachedWorldStories(stories);
        setWorldStories(stories);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setWorldLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const saveStories = (updated: StoryEntry[]) => {
    setStories(updated);
    saveStoredStories(updated, userEmail);
  };

  const upsertStory = (nextStory: StoryEntry) => {
    setStories((current) => {
      const updated = current.map((story) => (story.id === nextStory.id ? nextStory : story));
      saveStoredStories(updated, userEmail);
      return updated;
    });
  };

  useEffect(() => {
    const storiesNeedingAudio = stories.slice(0, 3).filter((story) => !getPlayableAudioUrl(story.audio) || !(story.wordTimings?.length));
    stories.forEach((story) => {
      const playableUrl = getPlayableAudioUrl(story.audio);
      if (playableUrl) primeAudioUrl(playableUrl);
    });
    if (!storiesNeedingAudio.length) return;

    let cancelled = false;
    void Promise.all(storiesNeedingAudio.map((story) => ensureStoryAudioAsset(story))).then((resolvedStories) => {
      if (cancelled) return;
      const resolvedMap = new Map(
        resolvedStories.filter((story): story is StoryEntry => Boolean(story)).map((story) => [story.id, story])
      );
      if (!resolvedMap.size) return;
      saveStories(stories.map((story) => resolvedMap.get(story.id) || story));
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [stories, userEmail]);

  const handleDelete = (storyId: string) => {
    saveStories(stories.filter((s) => s.id !== storyId));
    if (id) navigate("/stories");
  };

  // World story reading view — driven by URL so refresh works
  if (worldId) {
    const story = worldStories.find((s) => s.id === worldId);
    if (worldLoading || !story) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-muted-foreground">{worldLoading ? "Loading…" : "Story not found"}</p>
        </div>
      );
    }
    return (
      <WorldReadingView
        story={story}
        allStories={worldStories}
        onBack={() => navigate("/stories")}
        onSelect={(s) => navigate(`/stories/world/${s.id}`)}
      />
    );
  }

  // User story reading view
  if (id) {
    const story = stories.find((s) => s.id === id);
    if (!story) return null;
    return (
      <>
        <DeleteConfirmDialog
          open={Boolean(storyToDelete)}
          onOpenChange={(open) => { if (!open) setStoryToDelete(null); }}
          onConfirm={() => {
            if (!storyToDelete) return;
            handleDelete(storyToDelete.id);
            setStoryToDelete(null);
          }}
          title="Delete this story?"
          description="This story will be removed from your reading list."
        />
        <ReadingView
          story={story}
          onBack={() => navigate("/stories")}
          onDelete={() => setStoryToDelete(story)}
          onUpdateStory={upsertStory}
        />
      </>
    );
  }

  // List view
  return (
    <div className="app-page">
      <DeleteConfirmDialog
        open={Boolean(storyToDelete)}
        onOpenChange={(open) => { if (!open) setStoryToDelete(null); }}
        onConfirm={() => {
          if (!storyToDelete) return;
          handleDelete(storyToDelete.id);
          setStoryToDelete(null);
        }}
        title="Delete this story?"
        description="This story will be removed from your reading list."
      />
      <div className="page-stack">
        <div>
          <p className="admin-kicker">Learning</p>
          <h1 className="admin-page-title">Stories</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          <button
            type="button"
            onClick={() => setActiveTab("mine")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "mine"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            My Stories
            {stories.length > 0 && (
              <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{stories.length}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("browse")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "browse"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            Browse
            {worldStories.length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{worldStories.length}</span>
            )}
          </button>
        </div>

        {/* My Stories tab */}
        {activeTab === "mine" && (
          stories.length === 0 ? (
            <div className="admin-panel admin-panel-body flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <BookText className="h-10 w-10 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">No stories yet</h3>
              <p className="text-sm text-muted-foreground">
                Go to your Library, select some words, and click "Make Story".
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-5">
              {stories.map((story) => (
                <BookCard
                  key={story.id}
                  story={story}
                  onClick={() => navigate(`/stories/${story.id}`)}
                  onDelete={(e) => { e.stopPropagation(); setStoryToDelete(story); }}
                />
              ))}
            </div>
          )
        )}

        {/* Browse tab */}
        {activeTab === "browse" && (
          worldLoading ? (
            <div className="flex flex-wrap gap-5">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                  style={{ width: 180, height: 240 }}
                >
                  <div className="h-full w-full animate-pulse bg-muted/70" />
                </div>
              ))}
            </div>
          ) : worldStories.length === 0 ? (
            <div className="admin-panel admin-panel-body flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <Globe className="h-10 w-10 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">No stories loaded</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Run <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run scrape:stories</code> to import stories from worldstories.org.uk.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-5">
              {worldStories.map((story) => (
                <WorldBookCard
                  key={story.id}
                  story={story}
                  onClick={() => navigate(`/stories/world/${story.id}`)}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
