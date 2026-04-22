import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Play, Pause, BookMarked, X } from "lucide-react";
import { MOCK_READER_DICTIONARY } from "./mockReaderData";
import { translateText } from "@/lib/googleTranslate";
import { BOOK_ITEMS } from "../media/bookData";
import { WordWithTooltip } from "./hidden/WordWithTooltip";
import { AnnotationToolbar, HighlightColor, ExistingHighlight } from "@/components/reader/AnnotationToolbar";
import { HighlightableText, TextHighlight } from "@/components/reader/HighlightableText";
import { SyncedTtsText, getActiveWordIndex } from "@/components/reader/SyncedTtsText";
import { fetchTimedTtsAudio, TtsAudioResult } from "@/lib/tts";
import { startUnlockedPlaybackSession } from "@/lib/audioPlayback";

interface SavedEntry {
  translation: string;
  note?: string;
}

interface AnnotationState {
  text: string;
  x: number;
  y: number;
  rowId: string;
  start: number;
  end: number;
}

interface ActiveHighlightState {
  highlight: ExistingHighlight;
  x: number;
  y: number;
  rowId: string;
  text: string;
}

function tokenize(text: string): string[] {
  return text.split(" ").filter((w) => w.length > 0);
}

export default function BookReaderPage() {
  const { id } = useParams();
  const bookData =
    MOCK_READER_DICTIONARY[id || "default"] || MOCK_READER_DICTIONARY["default"];
  const readerRows = bookData.rows;

  const [activeRowId, setActiveRowId] = useState<string>(readerRows[0]?.id || "r1");
  const [translatedRows, setTranslatedRows] = useState<Record<string, string>>({});
  const [translatingRows, setTranslatingRows] = useState<Record<string, boolean>>({});
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const isAutoPlayingRef = useRef(false);

  // ── Vocabulary ────────────────────────────────────────────────────────────
  const [savedWords, setSavedWords] = useState<Record<string, SavedEntry>>({});
  const [isVocabOpen, setIsVocabOpen] = useState(false);
  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  
  const [annotationState, setAnnotationState] = useState<AnnotationState | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<ActiveHighlightState | null>(null);
  const [highlights, setHighlights] = useState<Record<string, TextHighlight[]>>({});

  // Load saved words from localStorage (per book)
  useEffect(() => {
    if (!id) return;
    try {
      const stored = localStorage.getItem(`lingowatch-vocab-${id}`);
      if (stored) setSavedWords(JSON.parse(stored));
      else setSavedWords({});
    } catch {
      setSavedWords({});
    }
    try {
      const storedHl = localStorage.getItem(`lingowatch-highlights-${id}`);
      if (storedHl) setHighlights(JSON.parse(storedHl));
      else setHighlights({});
    } catch {}
    try {
      const storedTranslations = localStorage.getItem(`lingowatch-reader-translations-${id}`);
      if (storedTranslations) setTranslatedRows(JSON.parse(storedTranslations));
      else setTranslatedRows({});
    } catch {
      setTranslatedRows({});
    }
  }, [id]);

  // Prefetch TTS for first 5 rows so audio is instant on first tap
  useEffect(() => {
    readerRows.slice(0, 5).forEach(row => void fetchTimedTtsAudio(row.source));
  }, [id]);

  const persistVocab = (bookId: string, data: Record<string, SavedEntry>) => {
    localStorage.setItem(`lingowatch-vocab-${bookId}`, JSON.stringify(data));
  };

  const saveWord = useCallback(
    (word: string, translation: string) => {
      if (!id) return;
      setSavedWords((prev) => {
        const updated = {
          ...prev,
          [word]: { translation, note: prev[word]?.note },
        };
        persistVocab(id, updated);
        return updated;
      });
    },
    [id]
  );

  const saveNote = (word: string, note: string) => {
    if (!id) return;
    setSavedWords((prev) => {
      const updated = {
        ...prev,
        [word]: { ...prev[word], translation: prev[word]?.translation || "", note: note.trim() },
      };
      persistVocab(id, updated);
      return updated;
    });
    setEditingNoteFor(null);
    setNoteInput("");
  };

  const deleteWord = (word: string) => {
    if (!id) return;
    setSavedWords((prev) => {
      const updated = { ...prev };
      delete updated[word];
      persistVocab(id, updated);
      return updated;
    });
    if (editingNoteFor === word) setEditingNoteFor(null);
  };

  // ── Phrase selection toolbar ──────────────────────────────────────────────
  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      const selectedText = selection.toString().trim();
      if (!selectedText || selectedText.length < 2) return;
      try {
        const range = selection.getRangeAt(0);
        
        let el: HTMLElement | null = range.startContainer.parentElement;
        let rowEl: HTMLElement | null = null;
        let rowId = "";
        while (el && el.id !== "main-reader-scroll") {
           if (el.id?.startsWith("row-text-")) {
              rowEl = el;
              rowId = el.id.replace("row-text-", "");
              break;
           }
           el = el.parentElement;
        }
        if (!rowEl) return;

        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(rowEl);
        preCaretRange.setEnd(range.startContainer, range.startOffset);
        
        const start = preCaretRange.toString().length;
        const end = start + range.toString().length;

        const rect = range.getBoundingClientRect();
        setAnnotationState({ 
           text: selectedText, 
           x: rect.left + rect.width / 2, 
           y: rect.bottom + 8,
           rowId,
           start,
           end
        });
      } catch {}
    }, 10);
  }, []);

  const saveAnnotation = (color: HighlightColor, note: string, hlId?: string) => {
    const targetRowId = annotationState ? annotationState.rowId : activeHighlight?.rowId;
    if (!targetRowId || !id) return;
    
    setHighlights(prev => {
      const updated = { ...prev };
      if (!updated[targetRowId]) updated[targetRowId] = [];
      
      if (hlId) {
        updated[targetRowId] = updated[targetRowId].map(h => h.id === hlId ? { ...h, color, note } : h);
      } else if (annotationState) {
        const newHl: TextHighlight = {
          id: Date.now().toString(),
          start: annotationState.start,
          end: annotationState.end,
          color,
          note
        };
        updated[targetRowId] = [...updated[targetRowId], newHl];
      }
      
      localStorage.setItem(`lingowatch-highlights-${id}`, JSON.stringify(updated));
      return updated;
    });
    setAnnotationState(null);
    setActiveHighlight(null);
    window.getSelection()?.removeAllRanges();
  };

  const deleteAnnotation = (hlId: string) => {
    const targetRowId = activeHighlight?.rowId;
    if (!targetRowId || !id) return;
    setHighlights(prev => {
      const updated = { ...prev };
      if (updated[targetRowId]) {
        updated[targetRowId] = updated[targetRowId].filter(h => h.id !== hlId);
        localStorage.setItem(`lingowatch-highlights-${id}`, JSON.stringify(updated));
      }
      return updated;
    });
    setActiveHighlight(null);
  };

  // ── Audio ─────────────────────────────────────────────────────────────────
  const translateRow = async (rowId: string, sourceText: string) => {
    if (translatingRows[rowId] || translatedRows[rowId]) return;
    setTranslatingRows((prev) => ({ ...prev, [rowId]: true }));
    try {
      const translation = await translateText(sourceText, { source: "en", target: "so" });
      setTranslatedRows((prev) => {
        const updated = { ...prev, [rowId]: translation };
        if (id) localStorage.setItem(`lingowatch-reader-translations-${id}`, JSON.stringify(updated));
        return updated;
      });
    } catch (e) {
      console.error(e);
      setTranslatedRows((prev) => ({ ...prev, [rowId]: "Error translating" }));
    } finally {
      setTranslatingRows((prev) => ({ ...prev, [rowId]: false }));
    }
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCache = useRef<Record<string, TtsAudioResult>>({});
  const audioPromises = useRef<Record<string, Promise<TtsAudioResult | null>>>({});
  const activeWordStartsRef = useRef<number[]>([]);
  const playbackSessionRef = useRef(0);
  const [activeTtsRowId, setActiveTtsRowId] = useState<string | null>(null);
  const [activeTtsWordIndex, setActiveTtsWordIndex] = useState<number | null>(null);

  const stopPlayback = useCallback(() => {
    playbackSessionRef.current += 1;
    isAutoPlayingRef.current = false;
    setIsAutoPlaying(false);
    setActiveTtsRowId(null);
    setActiveTtsWordIndex(null);
    activeWordStartsRef.current = [];

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }, []);

  const preloadAudio = (text: string): Promise<TtsAudioResult | null> => {
    if (!text) return Promise.resolve(null);
    if (audioCache.current[text]) return Promise.resolve(audioCache.current[text]);
    if (audioPromises.current[text]) return audioPromises.current[text];

    const promise = (async () => {
      try {
        const result = await fetchTimedTtsAudio(text);
        if (!result) return null;

        audioCache.current[text] = result;
        return result;
      } catch (e) {
        console.error(e);
      }
      return null;
    })();

    audioPromises.current[text] = promise;
    return promise;
  };

  const playAudio = async (
    text: string,
    sessionId = playbackSessionRef.current,
    playbackAudio?: HTMLAudioElement | null
  ) => {
    if (!text) return;
    if (sessionId !== playbackSessionRef.current) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setActiveTtsWordIndex(null);
    const result = await preloadAudio(text);
    if (sessionId !== playbackSessionRef.current) return;
    if (!result) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const audio = playbackAudio || new Audio();
      if (sessionId !== playbackSessionRef.current) {
        audio.pause();
        resolve();
        return;
      }
      audio.src = result.audioUrl;
      audio.preload = "auto";
      audioRef.current = audio;
      activeWordStartsRef.current = result.wordTimings.map((timing) => timing.startTime);
      audio.ontimeupdate = () => {
        if (sessionId !== playbackSessionRef.current) return;
        setActiveTtsWordIndex(getActiveWordIndex(audio.currentTime, activeWordStartsRef.current));
      };
      audio.onended = () => {
        if (sessionId !== playbackSessionRef.current) {
          resolve();
          return;
        }
        // Don't clear activeTtsRowId during auto-play — toggleAutoPlay manages it
        if (!isAutoPlayingRef.current) setActiveTtsRowId(null);
        setActiveTtsWordIndex(null);
        audioRef.current = null;
        resolve();
      };
      audio.onpause = () => {
        if (sessionId !== playbackSessionRef.current) {
          resolve();
          return;
        }
        setActiveTtsWordIndex(null);
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        resolve();
      };
      audio.onerror = () => {
        if (sessionId !== playbackSessionRef.current) {
          resolve();
          return;
        }
        if (!isAutoPlayingRef.current) setActiveTtsRowId(null);
        setActiveTtsWordIndex(null);
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        resolve();
      };
      audio.load();
      audio.play().catch((e) => {
        console.error(e);
        if (sessionId !== playbackSessionRef.current) {
          resolve();
          return;
        }
        setActiveTtsRowId(null);
        setActiveTtsWordIndex(null);
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        resolve();
      });
    });
  };

  const toggleAutoPlay = async () => {
    if (isAutoPlaying) {
      stopPlayback();
      return;
    }
    playbackSessionRef.current += 1;
    const sessionId = playbackSessionRef.current;
    setIsAutoPlaying(true);
    isAutoPlayingRef.current = true;
    let currentIndex = readerRows.findIndex((r) => r.id === activeRowId);
    if (currentIndex === -1) currentIndex = 0;
    for (let i = currentIndex; i < readerRows.length; i++) {
      if (!isAutoPlayingRef.current || sessionId !== playbackSessionRef.current) break;
      const row = readerRows[i];
      setActiveRowId(row.id);
      setActiveTtsRowId(row.id);
      const rowElement = document.getElementById(`row-${row.id}`);
      if (rowElement) rowElement.scrollIntoView({ behavior: "smooth", block: "center" });
      const nextRow = readerRows[i + 1];
      if (nextRow) preloadAudio(nextRow.source);
      await playAudio(row.source, sessionId);
    }
    if (sessionId === playbackSessionRef.current) {
      setIsAutoPlaying(false);
      isAutoPlayingRef.current = false;
      setActiveTtsRowId(null);
      setActiveTtsWordIndex(null);
    }
  };

  useEffect(() => {
    const activeRow = readerRows.find((r) => r.id === activeRowId);
    if (activeRow && activeRow.target === "(No translation available)") {
      translateRow(activeRowId, activeRow.source);
    }
  }, [activeRowId, readerRows]);

  useEffect(() => {
    if (readerRows && readerRows.length > 0) {
      readerRows.slice(0, 3).forEach((row) => preloadAudio(row.source));
    }
  }, [readerRows]);

  useEffect(() => {
    setActiveRowId(readerRows[0]?.id || "r1");
    setTranslatedRows({});
    setTranslatingRows({});
    stopPlayback();
    const mainContainer = document.getElementById("main-reader-scroll");
    if (mainContainer) mainContainer.scrollTo({ top: 0, behavior: "instant" });
  }, [id, readerRows, stopPlayback]);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  const savedCount = Object.keys(savedWords).length;

  return (
    <div className="h-screen w-screen flex bg-[#1a1a1a] text-white font-sans overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-[300px] shrink-0 border-r border-[#3e3e3e] bg-[#1a1a1a] hidden md:flex flex-col">
        <div className="h-[52px] shrink-0 border-b border-[#3e3e3e] flex items-center px-4 bg-[#222222]">
          <Link
            to="/media"
            className="flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-[11px] font-medium hover:bg-white/10 transition-colors tracking-wide"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            BACK
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {BOOK_ITEMS.slice(0, 50).map((book) => (
            <Link
              key={book.id}
              to={`/read/${book.id}`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                id === book.id
                  ? "bg-white/10 shadow-sm"
                  : "hover:bg-white/5 opacity-80 hover:opacity-100"
              }`}
            >
              <div className="w-8 h-12 bg-[#2a2a2a] shrink-0 rounded overflow-hidden shadow-sm">
                {book.coverUrl ? (
                  <img src={book.coverUrl} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-800 text-[9px] text-white/30 text-center leading-tight">
                    {book.title.slice(0, 5)}
                  </div>
                )}
              </div>
              <h4 className="text-[14.5px] font-medium text-white/95 truncate flex-1">
                {book.title}
              </h4>
            </Link>
          ))}
        </div>
      </aside>

      {/* ── Main Reader ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col relative bg-[#1a1a1a]">

        {/* Header */}
        <header className="h-[52px] shrink-0 border-b border-[#3e3e3e] flex items-center justify-between px-3 bg-[#222222]">
          {/* Left */}
          <div className="flex items-center gap-4 flex-1">
            <Link
              to="/media"
              className="md:hidden flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-[11px] font-medium hover:bg-white/10 transition-colors tracking-wide"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              BACK
            </Link>

            <div className="hidden items-center gap-1 text-white/50 md:flex">
            </div>

            <div className="flex items-center gap-1.5 text-[14px]">
              <span className="text-white/90 truncate max-w-[250px]">{bookData.title}</span>
            </div>
          </div>

          {/* Right — Vocab button */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAutoPlay}
              className={`md:hidden flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-medium transition-colors ${
                isAutoPlaying
                  ? "border-[#a855f7]/60 bg-[#a855f7]/20 text-[#a855f7]"
                  : "border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
              }`}
              aria-label={isAutoPlaying ? "Stop listening" : "Listen all"}
            >
              {isAutoPlaying ? (
                <Pause fill="currentColor" className="h-3.5 w-3.5" />
              ) : (
                <Play fill="currentColor" className="h-3.5 w-3.5 translate-x-[1px]" />
              )}
            </button>
            <button
              onClick={() => setIsVocabOpen((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors tracking-wide ${
                isVocabOpen
                  ? "border-[#a855f7]/60 bg-[#a855f7]/10 text-[#a855f7]"
                  : savedCount > 0
                  ? "border-[#a855f7]/30 text-[#a855f7]/70 hover:bg-[#a855f7]/10 hover:border-[#a855f7]/60"
                  : "border-white/20 text-white/50 hover:bg-white/10 hover:text-white"
              }`}
            >
              <BookMarked className="h-3.5 w-3.5" />
              {savedCount > 0 ? (
                <span>{savedCount} saved</span>
              ) : (
                <span>Vocab</span>
              )}
            </button>
          </div>
        </header>

        <main
          id="main-reader-scroll"
          onMouseUp={handleMouseUp}
          className="flex-1 min-h-0 overflow-y-auto w-full pt-8 pb-32 scrollbar-thin scrollbar-thumb-[#a855f7] scrollbar-track-transparent bg-[#1c1c1c]"
        >
          <div className="w-full flex flex-col border-y border-white/[0.06]">
            {readerRows.map((row) => (
              <div
                key={row.id}
                id={`row-${row.id}`}
                onMouseEnter={() => preloadAudio(row.source)}
                onClick={() => {
                  if (isAutoPlayingRef.current) {
                    stopPlayback();
                  }
                  setActiveRowId(row.id);
                  if (
                    row.target === "(No translation available)" &&
                    !translatedRows[row.id] &&
                    !translatingRows[row.id]
                  ) {
                    translateRow(row.id, row.source);
                  }
                }}
                className={`group flex flex-col md:flex-row transition-colors duration-200 border-b border-white/[0.06] last:border-b-0 cursor-pointer ${
                  activeRowId === row.id ? "bg-white/[0.04]" : "bg-transparent hover:bg-white/[0.02]"
                }`}
              >
                {/* Source Column (English) */}
                <div className="w-full md:w-1/2 p-6 md:py-8 md:px-12 border-b md:border-b-0 md:border-r border-white/[0.06] flex items-start gap-4">
                  
                  {/* Play Button */}
                  <div
                    className={`mt-1 shrink-0 w-6 h-6 flex items-center justify-center transition-opacity duration-300 ${
                      activeRowId === row.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeTtsRowId === row.id && audioRef.current) {
                        stopPlayback();
                        return;
                      }
                      playbackSessionRef.current += 1;
                      const sessionId = playbackSessionRef.current;
                      const unlockedAudio = startUnlockedPlaybackSession();
                      setActiveRowId(row.id);
                      setActiveTtsRowId(row.id);
                      void playAudio(row.source, sessionId, unlockedAudio);
                    }}
                  >
                    <div className="rounded-full bg-white/10 hover:bg-white/20 p-1.5 transition-colors">
                      {activeTtsRowId === row.id ? (
                        <Pause
                          fill="currentColor"
                          className="h-[10px] w-[10px] text-[#ff5f7e]"
                        />
                      ) : (
                        <Play
                          fill="currentColor"
                          className="ml-0.5 h-[10px] w-[10px] text-white/80"
                        />
                      )}
                    </div>
                  </div>

                  <p id={`row-text-${row.id}`} className="text-[15.5px] leading-[1.8] font-sans text-[#e0e0e0] flex-1 font-medium tracking-wide">
                    {activeTtsRowId === row.id ? (
                      <SyncedTtsText
                        text={row.source}
                        activeWordIndex={activeTtsWordIndex}
                        wordClassName="transition-colors duration-100"
                        inactiveStyle={{ color: "#888" }}
                        activeStyle={{
                          color: "#ff5f7e",
                          textShadow: "0 0 8px rgba(255, 95, 126, 0.95), 0 0 18px rgba(255, 49, 91, 0.65)",
                        }}
                      />
                    ) : (
                      <HighlightableText
                         text={row.source}
                         highlights={highlights[row.id] || []}
                         onHighlightClick={(hl, e) => {
                           e.stopPropagation();
                           const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                           setActiveHighlight({
                              highlight: { id: hl.id, color: hl.color, note: hl.note },
                              x: rect.left + rect.width / 2,
                              y: rect.bottom + 8,
                              rowId: row.id,
                              text: row.source.slice(hl.start, hl.end)
                           });
                           // disable current annotation if any
                           setAnnotationState(null);
                           window.getSelection()?.removeAllRanges();
                         }}
                         renderText={(chunkText, isHighlighted) => (
                           <>
                             {tokenize(chunkText).map((word, i) => {
                               const clean = word.replace(/[.,!?'"();:\-]/g, "").toLowerCase();
                               return (
                                 <WordWithTooltip
                                   key={`${row.id}-chunk-${i}`}
                                   word={word}
                                   onSave={saveWord}
                                   isSaved={!!savedWords[clean]}
                                   disabled={isHighlighted}
                                 />
                               );
                             })}
                           </>
                         )}
                      />
                    )}
                  </p>
                </div>

                {/* Target Column (Somali) */}
                <div className="w-full md:w-1/2 p-6 md:py-8 md:px-12 flex items-start">
                  <p className="text-[15.5px] leading-[1.8] font-sans text-white/40 flex-1 tracking-wide">
                    {translatedRows[row.id] || row.target}
                    {translatingRows[row.id] && (
                      <span className="ml-2 text-[#a855f7] font-medium text-[12px] animate-pulse not-italic font-sans">
                        ...
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </main>

        {/* FAB */}
        <button
          onClick={toggleAutoPlay}
          className="fixed bottom-10 right-10 z-20 hidden h-16 w-16 items-center justify-center rounded-full bg-[#a855f7] shadow-lg transition-transform hover:scale-105 md:flex"
        >
          {isAutoPlaying ? (
            <Pause fill="currentColor" className="w-7 h-7 text-white" />
          ) : (
            <Play fill="currentColor" className="w-7 h-7 text-white translate-x-[2px]" />
          )}
        </button>
      </div>

      {/* ── Annotation Toolbar ─────────────────────────────────────────────── */}
      {(annotationState || activeHighlight) && (
        <AnnotationToolbar
           x={annotationState ? annotationState.x : activeHighlight!.x}
           y={annotationState ? annotationState.y : activeHighlight!.y}
           selectedText={annotationState ? annotationState.text : activeHighlight!.text}
           existingHighlight={activeHighlight ? activeHighlight.highlight : undefined}
           onSaveAnnotation={saveAnnotation}
           onDeleteAnnotation={deleteAnnotation}
           onTranslate={(annotationState || activeHighlight) ? async () => {
             const textToTranslate = annotationState ? annotationState.text : activeHighlight!.text;
             return translateText(textToTranslate, { source: "en", target: "so" });
           } : undefined}
           onClose={() => {
             setAnnotationState(null);
             setActiveHighlight(null);
             window.getSelection()?.removeAllRanges();
           }}
        />
      )}

      {/* ── Vocabulary Drawer ────────────────────────────────────────────── */}
      <div
        className={`fixed inset-y-0 right-0 w-full sm:w-[340px] bg-[#1e1e1e] border-l border-[#3e3e3e] shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out ${
          isVocabOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="h-[52px] shrink-0 border-b border-[#3e3e3e] flex items-center justify-between px-4 bg-[#222222]">
          <div className="flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-[#a855f7]" />
            <span className="text-[14px] font-medium text-white/90">Saved Vocab</span>
            {savedCount > 0 && (
              <span className="text-[11px] font-medium bg-[#a855f7]/20 text-[#a855f7] rounded-full px-2 py-0.5">
                {savedCount}
              </span>
            )}
          </div>
          <button
            onClick={() => setIsVocabOpen(false)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer body */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {savedCount === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                <BookMarked className="w-5 h-5 text-white/20" />
              </div>
              <div>
                <p className="text-[14px] text-white/40 font-medium">No saved words yet</p>
                <p className="text-[12px] text-white/20 mt-1 leading-relaxed">
                  Hover any word and click Save, or select a phrase and translate it.
                </p>
              </div>
            </div>
          ) : (
            <div className="py-2">
              {Object.entries(savedWords).map(([word, entry]) => (
                <div
                  key={word}
                  className="border-b border-[#252525] px-4 py-3.5 group/item"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium text-white/90 truncate">{word}</p>
                      {entry.translation && (
                        <p className="text-[13px] text-[#a3a3a3] mt-0.5 leading-snug">
                          {entry.translation}
                        </p>
                      )}
                      {entry.note && editingNoteFor !== word && (
                        <p className="text-[12px] text-[#a855f7]/60 mt-1.5 italic leading-snug">
                          {entry.note}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          if (editingNoteFor === word) {
                            setEditingNoteFor(null);
                          } else {
                            setEditingNoteFor(word);
                            setNoteInput(entry.note || "");
                          }
                        }}
                        className="px-2 py-1 rounded text-[11px] text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
                      >
                        {entry.note ? "edit note" : "+ note"}
                      </button>
                      <button
                        onClick={() => deleteWord(word)}
                        className="p-1 rounded text-white/20 hover:text-red-400/70 hover:bg-white/5 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Inline note editor */}
                  {editingNoteFor === word && (
                    <div className="mt-2.5">
                      <textarea
                        autoFocus
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            saveNote(word, noteInput);
                          }
                          if (e.key === "Escape") setEditingNoteFor(null);
                        }}
                        placeholder="Add a note… (Enter to save)"
                        className="w-full bg-[#2a2a2a] border border-[#3e3e3e] focus:border-[#a855f7]/50 rounded-lg px-3 py-2 text-[13px] text-white/80 placeholder:text-white/20 resize-none focus:outline-none transition-colors leading-relaxed"
                        rows={2}
                      />
                      <div className="flex gap-2 mt-1.5">
                        <button
                          onClick={() => saveNote(word, noteInput)}
                          className="text-[11px] px-2.5 py-1 rounded-md bg-[#a855f7]/20 text-[#a855f7] hover:bg-[#a855f7]/30 transition-colors font-medium"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingNoteFor(null)}
                          className="text-[11px] px-2.5 py-1 rounded-md text-white/30 hover:text-white/60 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Vocab drawer backdrop on mobile */}
      {isVocabOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 sm:hidden"
          onClick={() => setIsVocabOpen(false)}
        />
      )}
    </div>
  );
}
