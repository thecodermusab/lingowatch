import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Play as PlayIcon, Square, Loader2
} from "lucide-react";

import { AnnotationToolbar, HighlightColor } from "@/components/reader/AnnotationToolbar";
import { HighlightableText, TextHighlight } from "@/components/reader/HighlightableText";
import { SyncedTtsText, getActiveWordIndex } from "@/components/reader/SyncedTtsText";

import { fetchImportedTextById } from "@/lib/data/importedTexts";
import { useAuth } from "@/contexts/AuthContext";
import { translateTexts } from "@/lib/translation/googleTranslate";
import { fetchTimedTtsAudio, TtsAudioResult } from "@/lib/audio/tts";

interface AnnotationState {
  text: string;
  x: number;
  y: number;
  sentenceId: string;
  start: number;
  end: number;
}

interface ActiveHighlightState {
  highlight: { id: string; color: HighlightColor; note?: string };
  x: number;
  y: number;
  sentenceId: string;
  text: string;
}

const QUERY_KEY = "imported-text-detail";

// Simple English sentence splitter for chunks
function parseIntoSentences(text: string) {
  const matches = text.match(/[^.!?]+[.!?]+/g) || [text];
  return matches.map(s => s.trim()).filter(s => s.length > 0);
}

export default function ImportedTextReaderPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(0);
  const autoScrollActive = useRef(true);
  const [translatedSentences, setTranslatedSentences] = useState<Record<string, string>>({});
  const [translationsLoading, setTranslationsLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const isPlayingAllRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsCache = useRef(new Map<string, TtsAudioResult>());
  const activeWordStartsRef = useRef<number[]>([]);
  const [activeTtsWordIndex, setActiveTtsWordIndex] = useState<number | null>(null);

  const [annotationState, setAnnotationState] = useState<AnnotationState | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<ActiveHighlightState | null>(null);
  const [highlights, setHighlights] = useState<Record<string, TextHighlight[]>>({});

  useEffect(() => {
    if (!id) return;
    try {
      const storedHl = localStorage.getItem(`lingowatch-imported-highlights-${id}`);
      if (storedHl) setHighlights(JSON.parse(storedHl));
      else setHighlights({});
    } catch {}
    try {
      const storedTranslations = localStorage.getItem(`lingowatch-imported-translations-${id}`);
      if (storedTranslations) setTranslatedSentences(JSON.parse(storedTranslations));
      else setTranslatedSentences({});
    } catch {
      setTranslatedSentences({});
    }
  }, [id]);

  // Prefetch TTS for first 5 sentences so audio is instant
  useEffect(() => {
    allSentences.slice(0, 5).forEach(s => void fetchTimedTtsAudio(s.eng));
  }, [id]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      const selectedText = selection.toString().trim();
      if (!selectedText || selectedText.length < 2) return;
      try {
        const range = selection.getRangeAt(0);
        let el: HTMLElement | null = range.startContainer.parentElement;
        let sentenceEl: HTMLElement | null = null;
        let sentenceId = "";
        while (el && el.tagName !== "MAIN") {
           if (el.id?.startsWith("sentence-text-")) {
              sentenceEl = el;
              sentenceId = el.id.replace("sentence-text-", "");
              break;
           }
           el = el.parentElement;
        }
        if (!sentenceEl) return;

        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(sentenceEl);
        preCaretRange.setEnd(range.startContainer, range.startOffset);
        
        const start = preCaretRange.toString().length;
        const end = start + range.toString().length;

        const rect = range.getBoundingClientRect();
        setAnnotationState({ 
           text: selectedText, 
           x: rect.left + rect.width / 2, 
           y: rect.bottom + 8,
           sentenceId,
           start,
           end
        });
      } catch {}
    }, 10);
  }, []);

  const saveAnnotation = (color: HighlightColor, note: string, hlId?: string) => {
    const targetSentenceId = annotationState ? annotationState.sentenceId : activeHighlight?.sentenceId;
    if (!targetSentenceId || !id) return;
    
    setHighlights(prev => {
      const updated = { ...prev };
      if (!updated[targetSentenceId]) updated[targetSentenceId] = [];
      
      if (hlId) {
        updated[targetSentenceId] = updated[targetSentenceId].map(h => h.id === hlId ? { ...h, color, note } : h);
      } else if (annotationState) {
        const newHl: TextHighlight = {
          id: Date.now().toString(),
          start: annotationState.start,
          end: annotationState.end,
          color,
          note
        };
        updated[targetSentenceId] = [...updated[targetSentenceId], newHl];
      }
      
      localStorage.setItem(`lingowatch-imported-highlights-${id}`, JSON.stringify(updated));
      return updated;
    });
    setAnnotationState(null);
    setActiveHighlight(null);
    window.getSelection()?.removeAllRanges();
  };

  const deleteAnnotation = (hlId: string) => {
    const targetSentenceId = activeHighlight?.sentenceId;
    if (!targetSentenceId || !id) return;
    setHighlights(prev => {
      const updated = { ...prev };
      if (updated[targetSentenceId]) {
        updated[targetSentenceId] = updated[targetSentenceId].filter(h => h.id !== hlId);
        localStorage.setItem(`lingowatch-imported-highlights-${id}`, JSON.stringify(updated));
      }
      return updated;
    });
    setActiveHighlight(null);
  };

  async function getSentenceAudio(id: string, text: string) {
    let result = ttsCache.current.get(id);
    if (!result) {
      try {
        result = await fetchTimedTtsAudio(text);
        if (!result) return null;
        ttsCache.current.set(id, result);
      } catch (err) {
        console.error("TTS error", err);
        return null;
      }
    }
    return result;
  }

  async function playSentenceAudio(id: string, text: string) {
    const result = await getSentenceAudio(id, text);
    if (!result) return;

    const audio = new Audio(result.audioUrl);
    audioRef.current = audio;
    activeWordStartsRef.current = result.wordTimings.map((timing) => timing.startTime);
    setActiveTtsWordIndex(null);
    setPlayingId(id);
    await new Promise<void>((resolve) => {
      audio.ontimeupdate = () => {
        setActiveTtsWordIndex(getActiveWordIndex(audio.currentTime, activeWordStartsRef.current));
      };
      audio.onended = () => resolve();
      audio.onpause = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch((err) => {
        console.error("Audio playback error", err);
        resolve();
      });
    });
    setPlayingId(null);
    setActiveTtsWordIndex(null);
  }

  async function speakSentence(id: string, text: string) {
    if (playingId === id) {
      audioRef.current?.pause();
      setPlayingId(null);
      setActiveTtsWordIndex(null);
      return;
    }
    audioRef.current?.pause();
    await playSentenceAudio(id, text);
  }

  async function toggleListenAll() {
    if (isPlayingAllRef.current) {
      isPlayingAllRef.current = false;
      setIsPlayingAll(false);
      audioRef.current?.pause();
      setPlayingId(null);
      setActiveTtsWordIndex(null);
      return;
    }

    isPlayingAllRef.current = true;
    setIsPlayingAll(true);
    audioRef.current?.pause();

    for (let index = activeSentenceIndex; index < allSentences.length; index += 1) {
      if (!isPlayingAllRef.current) break;
      const sentence = allSentences[index];
      setActiveSentenceIndex(index);
      await playSentenceAudio(sentence.id, sentence.eng);
    }

    isPlayingAllRef.current = false;
    setIsPlayingAll(false);
  }

  const textQuery = useQuery({
    queryKey: [QUERY_KEY, user?.id, id],
    queryFn: () => fetchImportedTextById(user?.id || "", id),
    enabled: Boolean(user?.id && id),
  });

  const allSentences = useMemo(() => {
    if (!textQuery.data?.content?.sections) return [];
    
    const sentences: { eng: string, id: string, isNewParagraph?: boolean }[] = [];
    textQuery.data.content.sections.forEach((section, sidx) => {
      section.blocks.forEach((block, bidx) => {
        if (block.type === "paragraph" || block.type === "heading") {
          const split = parseIntoSentences(block.text);
          split.forEach((s, idx) => {
            sentences.push({
              eng: s,
              id: `s-${sidx}-${bidx}-${idx}`,
              isNewParagraph: idx === 0
            });
          });
        }
      });
    });
    return sentences;
  }, [textQuery.data]);

  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRef.current && autoScrollActive.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // Re-enable auto scroll for next changes (e.g., keyboard) unless explicitly disabled
    autoScrollActive.current = true;
  }, [activeSentenceIndex]);

  useEffect(() => {
    let cancelled = false;

    const runTranslations = async () => {
      if (!allSentences.length) {
        setTranslatedSentences({});
        return;
      }

      const cachedRaw = localStorage.getItem(`lingowatch-imported-translations-${id}`);
      const cachedMap: Record<string, string> = cachedRaw ? JSON.parse(cachedRaw) : {};
      const missingSentences = allSentences.filter((sentence) => !cachedMap[sentence.id]);
      if (!missingSentences.length) {
        setTranslatedSentences(cachedMap);
        return;
      }

      setTranslationsLoading(true);
      try {
        const nextMap: Record<string, string> = { ...cachedMap };
        const chunkSize = 25;

        for (let index = 0; index < missingSentences.length; index += chunkSize) {
          const chunk = missingSentences.slice(index, index + chunkSize);
          const translations = await translateTexts(
            chunk.map((sentence) => sentence.eng),
            { source: "en", target: "so" },
          );

          chunk.forEach((sentence, chunkIndex) => {
            nextMap[sentence.id] = translations[chunkIndex] || "";
          });
        }

        if (!cancelled) {
          setTranslatedSentences(nextMap);
          if (id) localStorage.setItem(`lingowatch-imported-translations-${id}`, JSON.stringify(nextMap));
        }
      } catch (error) {
        console.error("Imported text translation error", error);
      } finally {
        if (!cancelled) {
          setTranslationsLoading(false);
        }
      }
    };

    void runTranslations();

    return () => {
      cancelled = true;
    };
  }, [allSentences]);

  if (textQuery.isLoading || !user) {
    return <div className="min-h-screen bg-[#212121] flex justify-center items-center"><Loader2 className="animate-spin text-white/50 w-10 h-10" /></div>;
  }

  if (!textQuery.data) {
    return (
      <div className="min-h-screen bg-[#212121] flex flex-col justify-center items-center text-white/50">
        <p>Text not found or you do not have permission to view it.</p>
        <Link to="/media?tab=my_texts" className="mt-4 text-[#4fb5a2] hover:underline">Back to My Texts</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#212121] text-white overflow-hidden relative">
      
      <header className="h-[52px] w-full shrink-0 border-b border-[#333] bg-[#1e1e1e] px-3 shadow-sm">
        <div className="flex h-full min-w-0 items-center justify-between gap-3">
          <Link
            to="/media?tab=my_texts"
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-[11px] font-medium tracking-wide text-white transition-colors hover:bg-white/10"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            BACK
          </Link>

          <div className="min-w-0 flex-1 text-center md:text-left">
            <span className="block truncate text-[14px] font-medium tracking-wide text-white/90">
              {textQuery.data.title}
            </span>
          </div>

          <button
            onClick={toggleListenAll}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors md:px-3 ${
              isPlayingAll
                ? "border-[#4fb5a2]/60 bg-[#4fb5a2]/20 text-[#4fb5a2]"
                : "border-[#4fb5a2]/30 bg-[#4fb5a2]/10 text-[#4fb5a2] hover:bg-[#4fb5a2]/20"
            }`}
          >
            {isPlayingAll ? (
              <Square className="h-3 w-3" fill="currentColor" />
            ) : (
              <PlayIcon className="h-3 w-3 translate-x-[1px]" fill="currentColor" />
            )}
            <span className="hidden sm:inline">{isPlayingAll ? "Stop" : "Listen"}</span>
          </button>
        </div>
      </header>

      {/* Main Translation Viewer */}
      <main className="flex flex-1 overflow-hidden relative" onMouseUp={handleMouseUp}>
         {/* Left Side Sidebar (Generic LR style) */}
         <aside className="w-[50px] bg-[#1a1a1a] border-r border-[#333] hidden lg:flex flex-col items-center py-4 gap-6 shrink-0">
            <div className="w-6 h-6 rounded bg-[#4fb5a2] text-[#121c25] flex items-center justify-center font-bold text-xs">E</div>
            <div className="w-5 h-5 text-white/40"><PlayIcon className="w-4 h-4" fill="currentColor" /></div>
            <div className="w-5 h-5 text-white/40 border border-white/40 rounded-sm"></div>
         </aside>

         <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#444] scrollbar-track-transparent">
            {/* The Translation Layout grid container */}
            <div className="flex min-h-full justify-center px-4 py-8 md:px-10 md:py-12">
               <div className="flex w-full max-w-5xl flex-col pb-28 pt-2 md:pt-8 md:pb-32">
                  {allSentences.map((sentence, idx) => {
                     const isSelected = activeSentenceIndex === idx;
                     
                     return (
                        <div 
                          key={sentence.id} 
                          ref={isSelected ? activeRef : null}
                          onClick={() => {
                             // Disable auto-snap when purely clicking with mouse
                             autoScrollActive.current = false;
                             setActiveSentenceIndex(idx);
                          }}
                          className={`group flex cursor-pointer flex-col border-b border-[#333] transition-colors md:flex-row ${sentence.isNewParagraph && idx > 0 ? 'mt-8 border-t border-t-[#333]' : ''} ${isSelected ? 'bg-[#313338] border-[#444]' : 'hover:bg-[#282828]'}`}
                        >
                           {/* English Left Column */}
                           <div className="flex min-h-[80px] flex-1 items-start gap-3 p-4 md:p-5 md:pr-8">
                              <button
                                onClick={(e) => { e.stopPropagation(); void speakSentence(sentence.id, sentence.eng); }}
                                className={`mt-1 shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                                  playingId === sentence.id
                                    ? 'bg-[#9c27b0] opacity-100'
                                    : isSelected
                                    ? 'bg-[#9c27b0] opacity-100'
                                    : 'bg-white/10 opacity-0 group-hover:opacity-100'
                                }`}
                              >
                                {playingId === sentence.id
                                  ? <Square className="w-2 h-2 text-white" fill="currentColor" />
                                  : <PlayIcon className="w-2.5 h-2.5 text-white ml-0.5" fill="currentColor" />
                                }
                              </button>
                              <p id={`sentence-text-${sentence.id}`} className={`relative text-[15px] font-medium leading-[1.8] tracking-wide md:text-[16px] ${isSelected ? 'text-white' : 'text-[#cccccc]'}`}>
                                {playingId === sentence.id ? (
                                  <SyncedTtsText
                                    text={sentence.eng}
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
                                     text={sentence.eng}
                                     highlights={highlights[sentence.id] || []}
                                     onHighlightClick={(hl, e) => {
                                       e.stopPropagation();
                                       const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                       setActiveHighlight({
                                          highlight: { id: hl.id, color: hl.color, note: hl.note },
                                          x: rect.left + rect.width / 2,
                                          y: rect.bottom + 8,
                                          sentenceId: sentence.id,
                                          text: sentence.eng.slice(hl.start, hl.end)
                                       });
                                       setAnnotationState(null);
                                       window.getSelection()?.removeAllRanges();
                                     }}
                                  />
                                )}
                              </p>
                           </div>

                           {/* Divider */}
                           <div className="h-[1px] bg-[#333] md:h-auto md:w-[1px] md:self-stretch" />

                           {/* Somali Translated Right Column */}
                           <div className="min-h-[64px] flex-1 p-4 md:min-h-[80px] md:p-5 md:pl-8">
                              <p className={`text-[14px] font-normal leading-[1.8] tracking-wide md:text-[15px] ${isSelected ? 'text-[#b3b3b3]' : 'text-[#777777]'}`}>
                                {translatedSentences[sentence.id] || (translationsLoading ? "Translating..." : "")}
                              </p>
                           </div>
                        </div>
                     )
                  })}
               </div>
            </div>
         </div>
      </main>

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
             const res = await translateTexts([textToTranslate], { source: "en", target: "so" });
             return res[0] || null;
           } : undefined}
           onClose={() => {
             setAnnotationState(null);
             setActiveHighlight(null);
             window.getSelection()?.removeAllRanges();
           }}
        />
      )}

    </div>
  );
}
