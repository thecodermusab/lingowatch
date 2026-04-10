import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Info, Search, SkipBack, SkipForward, Play as PlayIcon, Square, Settings, Share, Layers, Keyboard, Edit2, Loader2, X
} from "lucide-react";

import { AnnotationToolbar, HighlightColor } from "@/components/reader/AnnotationToolbar";
import { HighlightableText, TextHighlight } from "@/components/reader/HighlightableText";

const TTS_KEY = import.meta.env.VITE_GOOGLE_TTS_KEY as string;
import { fetchImportedTextById } from "@/lib/importedTexts";
import { useAuth } from "@/contexts/AuthContext";
import { ImportedTextBlock } from "@/types";
import { translateTexts } from "@/lib/googleTranslate";

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsCache = useRef(new Map<string, string>());

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
  }, [id]);

  const handleMouseUp = React.useCallback(() => {
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
           y: rect.top,
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

  async function speakSentence(id: string, text: string) {
    if (playingId === id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();

    let dataUrl = ttsCache.current.get(id);
    if (!dataUrl) {
      try {
        const res = await fetch(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${TTS_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              input: { text },
              voice: { languageCode: "en-US", ssmlGender: "FEMALE" },
              audioConfig: { audioEncoding: "MP3" },
            }),
          }
        );
        const data = await res.json();
        dataUrl = `data:audio/mp3;base64,${data.audioContent}`;
        ttsCache.current.set(id, dataUrl);
      } catch (err) {
        console.error("TTS error", err);
        return;
      }
    }

    const audio = new Audio(dataUrl);
    audioRef.current = audio;
    setPlayingId(id);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    void audio.play();
  }

  const textQuery = useQuery({
    queryKey: [QUERY_KEY, user?.id, id],
    queryFn: () => fetchImportedTextById(user?.id || "", id),
    enabled: Boolean(user?.id && id),
  });

  const allSentences = useMemo(() => {
    if (!textQuery.data?.content?.sections) return [];
    
    const sentences: { eng: string, id: string }[] = [];
    textQuery.data.content.sections.forEach((section, sidx) => {
      section.blocks.forEach((block, bidx) => {
        if (block.type === "paragraph" || block.type === "heading") {
          const split = parseIntoSentences(block.text);
          split.forEach((s, idx) => {
            sentences.push({
              eng: s,
              id: `s-${sidx}-${bidx}-${idx}`
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

      setTranslationsLoading(true);
      try {
        const nextMap: Record<string, string> = {};
        const chunkSize = 25;

        for (let index = 0; index < allSentences.length; index += chunkSize) {
          const chunk = allSentences.slice(index, index + chunkSize);
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
      
      {/* Top Navigation Header matching LR Design */}
      <header className="h-[52px] bg-[#1e1e1e] border-b border-[#333] flex items-center justify-between px-4 shrink-0 shadow-sm z-10 w-full relative">
        <div className="flex items-center h-full">
           <Link to="/media?tab=my_texts" className="flex items-center gap-2 text-white hover:text-gray-300 tracking-wider text-[12.5px] font-medium transition-colors">
              <ArrowLeft className="w-4 h-4" />
              CATALOGUE
           </Link>
           
           <div className="flex items-center ml-6 gap-2 text-[#aaa]">
              <button className="hover:text-white transition-colors" onClick={() => { autoScrollActive.current = true; setActiveSentenceIndex(Math.max(0, activeSentenceIndex - 1)); }}>
                 <SkipBack className="w-4 h-4" />
              </button>
              <button className="hover:text-white transition-colors" onClick={() => { autoScrollActive.current = true; setActiveSentenceIndex(Math.min(allSentences.length - 1, activeSentenceIndex + 1)); }}>
                 <SkipForward className="w-4 h-4" />
              </button>
           </div>
           
           <div className="ml-6 flex items-center gap-3 border-l border-[#333] pl-6 h-[24px]">
              <span className="text-[14px] font-medium tracking-wide text-white truncate max-w-[400px]">
                {textQuery.data.title}
              </span>
              <button className="text-[#888] hover:text-white"><Info className="w-4 h-4" /></button>
              <button className="text-[#888] hover:text-white"><Edit2 className="w-3.5 h-3.5" /></button>
           </div>
        </div>
        
        <div className="flex items-center gap-1.5 h-full">
            <div className="flex items-center gap-4 text-[#888] border-r border-[#333] pr-5 h-[24px]">
               <button className="hover:text-white"><Keyboard className="w-4 h-4" /></button>
               <button className="hover:text-white"><Share className="w-4 h-4" /></button>
               <button className="hover:text-white"><Layers className="w-4 h-4" /></button>
               <button className="hover:text-white"><Settings className="w-4 h-4" /></button>
            </div>
            
            <div className="flex items-center gap-4 px-3">
               <span className="text-[11px] font-medium text-white/50 bg-[#333] px-1.5 py-0.5 rounded cursor-pointer hover:bg-[#444] transition-colors">AP</span>
               <div className="w-6 h-6 rounded-full border-2 border-[#555] flex items-center justify-center text-[10px] font-bold text-[#888] cursor-pointer hover:border-white hover:text-white transition-all">
                 1x
               </div>
            </div>
            
            <div className="flex text-[12px] font-medium uppercase tracking-wider text-[#888] h-full items-center ml-2 border-l border border-t-0 border-b-0 border-[#333]">
                <button className="px-5 h-full border-b-[3px] border-white text-white bg-[#2a2a2a]">
                  TEXT
                </button>
                <button className="px-5 h-full hover:bg-[#2a2a2a] transition-colors border-b-[3px] border-transparent">
                  WORDS
                </button>
            </div>
            
            <button className="pl-4 pr-2 text-[#888] hover:text-white">
               <Search className="w-5 h-5" />
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
            <div className="min-h-full px-10 py-12 flex justify-center">
               <div className="w-full max-w-5xl flex flex-col pt-8 pb-32">
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
                          className={`flex group border-b border-[#333] cursor-pointer transition-colors ${isSelected ? 'bg-[#313338] border-[#444]' : 'hover:bg-[#282828]'}`}
                        >
                           {/* English Left Column */}
                           <div className="flex-1 p-5 pr-8 flex items-start gap-3 min-h-[80px]">
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
                              <p id={`sentence-text-${sentence.id}`} className={`text-[16px] leading-[1.8] font-medium tracking-wide relative ${isSelected ? 'text-white' : 'text-[#cccccc]'}`}>
                                <HighlightableText
                                   text={sentence.eng}
                                   highlights={highlights[sentence.id] || []}
                                   onHighlightClick={(hl, e) => {
                                     e.stopPropagation();
                                     const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                     setActiveHighlight({
                                        highlight: { id: hl.id, color: hl.color, note: hl.note },
                                        x: rect.left + rect.width / 2,
                                        y: rect.top,
                                        sentenceId: sentence.id
                                     });
                                     setAnnotationState(null);
                                     window.getSelection()?.removeAllRanges();
                                   }}
                                />
                              </p>
                           </div>

                           {/* Divider */}
                           <div className="w-[1px] bg-[#333] self-stretch" />

                           {/* Somali Translated Right Column */}
                           <div className="flex-1 p-5 pl-8 min-h-[80px]">
                              <p className={`text-[15px] leading-[1.8] font-normal tracking-wide ${isSelected ? 'text-[#b3b3b3]' : 'text-[#777777]'}`}>
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

      {/* Global Floating Action Button */}
      {allSentences[activeSentenceIndex] && (
        <button
          onClick={() => { const s = allSentences[activeSentenceIndex]; void speakSentence(s.id, s.eng); }}
          className="absolute bottom-10 right-10 w-16 h-16 rounded-full bg-[#9c27b0] hover:bg-[#ba68c8] text-white flex items-center justify-center shadow-2xl transition-all transform hover:scale-105"
        >
          {playingId === allSentences[activeSentenceIndex]?.id
            ? <Square className="w-7 h-7" fill="currentColor" />
            : <PlayIcon className="w-8 h-8 ml-1" fill="currentColor" />
          }
        </button>
      )}

      {/* ── Annotation Toolbar ─────────────────────────────────────────────── */}
      {(annotationState || activeHighlight) && (
        <AnnotationToolbar
           x={annotationState ? annotationState.x : activeHighlight!.x}
           y={annotationState ? annotationState.y : activeHighlight!.y}
           selectedText={annotationState ? annotationState.text : undefined}
           existingHighlight={activeHighlight ? activeHighlight.highlight : undefined}
           onSaveAnnotation={saveAnnotation}
           onDeleteAnnotation={deleteAnnotation}
           onTranslate={annotationState ? async () => {
             const res = await translateTexts([annotationState.text], { source: "en", target: "so" });
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
