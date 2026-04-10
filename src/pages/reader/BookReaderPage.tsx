import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Info, Play, Pause, BookMarked, X, Loader2 } from "lucide-react";
import { MOCK_READER_DICTIONARY } from "./mockReaderData";
import { translateText } from "@/lib/googleTranslate";
import { BOOK_ITEMS } from "../media/bookData";
import { WordWithTooltip } from "./hidden/WordWithTooltip";

interface SavedEntry {
  translation: string;
  note?: string;
}

interface PhraseBar {
  text: string;
  x: number;
  y: number;
  translation?: string;
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
  const [phraseBar, setPhraseBar] = useState<PhraseBar | null>(null);
  const [isTranslatingPhrase, setIsTranslatingPhrase] = useState(false);
  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const phraseBarRef = useRef<HTMLDivElement>(null);

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
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        setPhraseBar({ text: selectedText, x: rect.left + rect.width / 2, y: rect.top });
      } catch {}
    }, 10);
  }, []);

  // Close phrase bar when clicking outside it
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (phraseBarRef.current && !phraseBarRef.current.contains(e.target as Node)) {
        setPhraseBar(null);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const translatePhrase = async () => {
    if (!phraseBar || phraseBar.translation || isTranslatingPhrase) return;
    setIsTranslatingPhrase(true);
    try {
      const result = await translateText(phraseBar.text, { source: "en", target: "so" });
      setPhraseBar((prev) => (prev ? { ...prev, translation: result } : null));
    } finally {
      setIsTranslatingPhrase(false);
    }
  };

  const savePhrase = () => {
    if (!phraseBar || !id) return;
    const cleanPhrase = phraseBar.text.toLowerCase().replace(/\s+/g, " ");
    setSavedWords((prev) => {
      const updated = {
        ...prev,
        [cleanPhrase]: {
          translation: phraseBar.translation || "",
          note: prev[cleanPhrase]?.note,
        },
      };
      persistVocab(id, updated);
      return updated;
    });
    setPhraseBar(null);
    window.getSelection()?.removeAllRanges();
    setIsVocabOpen(true);
  };

  // ── Audio ─────────────────────────────────────────────────────────────────
  const translateRow = async (rowId: string, sourceText: string) => {
    if (translatingRows[rowId] || translatedRows[rowId]) return;
    setTranslatingRows((prev) => ({ ...prev, [rowId]: true }));
    try {
      const translation = await translateText(sourceText, { source: "en", target: "so" });
      setTranslatedRows((prev) => ({ ...prev, [rowId]: translation }));
    } catch (e) {
      console.error(e);
      setTranslatedRows((prev) => ({ ...prev, [rowId]: "Error translating" }));
    } finally {
      setTranslatingRows((prev) => ({ ...prev, [rowId]: false }));
    }
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCache = useRef<Record<string, string>>({});
  const audioPromises = useRef<Record<string, Promise<string | null>>>({});

  const preloadAudioBase64 = (text: string): Promise<string | null> => {
    if (!text) return Promise.resolve(null);
    if (audioCache.current[text]) return Promise.resolve(audioCache.current[text]);
    if (audioPromises.current[text]) return audioPromises.current[text];

    const promise = (async () => {
      try {
        const apiKey =
          import.meta.env.VITE_GOOGLE_TTS_KEY || import.meta.env.VITE_GOOGLE_TRANSLATE_KEY;
        if (!apiKey) {
          console.warn("Google API Key missing for high-quality audio.");
          return null;
        }
        const response = await fetch(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              input: { text },
              voice: { languageCode: "en-US", name: "en-US-Journey-F" },
              audioConfig: { audioEncoding: "MP3" },
            }),
          }
        );
        const data = await response.json();
        if (data.error) { console.error("TTS API Error:", data.error); return null; }
        if (data.audioContent) {
          audioCache.current[text] = data.audioContent;
          return data.audioContent;
        }
      } catch (e) {
        console.error(e);
      }
      return null;
    })();

    audioPromises.current[text] = promise;
    return promise;
  };

  const playAudio = async (text: string) => {
    if (!text) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audioContent = await preloadAudioBase64(text);
    if (!audioContent) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const audio = new Audio("data:audio/mp3;base64," + audioContent);
      audioRef.current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch((e) => { console.error(e); resolve(); });
    });
  };

  const toggleAutoPlay = async () => {
    if (isAutoPlaying) {
      setIsAutoPlaying(false);
      isAutoPlayingRef.current = false;
      if (audioRef.current) audioRef.current.pause();
      return;
    }
    setIsAutoPlaying(true);
    isAutoPlayingRef.current = true;
    let currentIndex = readerRows.findIndex((r) => r.id === activeRowId);
    if (currentIndex === -1) currentIndex = 0;
    for (let i = currentIndex; i < readerRows.length; i++) {
      if (!isAutoPlayingRef.current) break;
      const row = readerRows[i];
      setActiveRowId(row.id);
      const rowElement = document.getElementById(`row-${row.id}`);
      if (rowElement) rowElement.scrollIntoView({ behavior: "smooth", block: "center" });
      const nextRow = readerRows[i + 1];
      if (nextRow) preloadAudioBase64(nextRow.source);
      await playAudio(row.source);
    }
    setIsAutoPlaying(false);
    isAutoPlayingRef.current = false;
  };

  useEffect(() => {
    const activeRow = readerRows.find((r) => r.id === activeRowId);
    if (activeRow && activeRow.target === "(No translation available)") {
      translateRow(activeRowId, activeRow.source);
    }
  }, [activeRowId, readerRows]);

  useEffect(() => { window.speechSynthesis.getVoices(); }, []);

  useEffect(() => {
    if (readerRows && readerRows.length > 0) {
      readerRows.slice(0, 3).forEach((row) => preloadAudioBase64(row.source));
    }
  }, [readerRows]);

  useEffect(() => {
    setActiveRowId(readerRows[0]?.id || "r1");
    setTranslatedRows({});
    setTranslatingRows({});
    setIsAutoPlaying(false);
    isAutoPlayingRef.current = false;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    const mainContainer = document.getElementById("main-reader-scroll");
    if (mainContainer) mainContainer.scrollTo({ top: 0, behavior: "instant" });
  }, [id, readerRows]);

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

            <div className="flex items-center gap-1 text-white/50">
              <button className="p-1 hover:text-white transition-colors">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M4 4h2v16H4V4zm14 0L8 12l10 8V4z" />
                </svg>
              </button>
              <button className="p-1 hover:text-white transition-colors">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M6 12l10-8v16L6 12zm12-8h2v16h-2V4z" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[14px]">
              <span className="text-white/90 truncate max-w-[250px]">{bookData.title}</span>
              <Info className="h-3.5 w-3.5 text-white/40" />
            </div>
          </div>

          {/* Right — Vocab button */}
          <div className="flex items-center gap-2">
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
                onMouseEnter={() => preloadAudioBase64(row.source)}
                onClick={() => {
                  if (isAutoPlayingRef.current) {
                    setIsAutoPlaying(false);
                    isAutoPlayingRef.current = false;
                    if (audioRef.current) audioRef.current.pause();
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
                      setActiveRowId(row.id);
                      playAudio(row.source);
                    }}
                  >
                    <div className="rounded-full bg-white/10 hover:bg-white/20 p-1.5 transition-colors">
                      <Play
                        fill="currentColor"
                        className="w-[10px] h-[10px] text-white/80 ml-0.5"
                      />
                    </div>
                  </div>

                  <p className="text-[15.5px] leading-[1.8] font-sans text-[#e0e0e0] flex-1 font-medium tracking-wide">
                    {tokenize(row.source).map((word, i) => {
                      const clean = word.replace(/[.,!?'"();:\-]/g, "").toLowerCase();
                      return (
                        <WordWithTooltip
                          key={`${row.id}-${i}`}
                          word={word}
                          onSave={saveWord}
                          isSaved={!!savedWords[clean]}
                        />
                      );
                    })}
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
          className="fixed bottom-10 right-10 w-16 h-16 rounded-full bg-[#a855f7] shadow-lg flex items-center justify-center hover:scale-105 transition-transform z-20"
        >
          {isAutoPlaying ? (
            <Pause fill="currentColor" className="w-7 h-7 text-white" />
          ) : (
            <Play fill="currentColor" className="w-7 h-7 text-white translate-x-[2px]" />
          )}
        </button>
      </div>

      {/* ── Phrase Selection Toolbar ─────────────────────────────────────── */}
      {phraseBar && (
        <div
          ref={phraseBarRef}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: phraseBar.x,
            top: Math.max(phraseBar.y - 64, 8),
            transform: "translateX(-50%)",
            zIndex: 60,
          }}
          className="bg-[#2B2D31] border border-[#3E4044] rounded-xl shadow-2xl overflow-hidden"
        >
          {phraseBar.translation ? (
            /* ─ Translated state ─ */
            <div className="flex flex-col min-w-[180px] max-w-[280px]">
              <div className="px-4 py-3 text-center">
                <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5">
                  Somali
                </p>
                <p className="text-[15px] text-white/90 font-medium leading-snug">
                  {phraseBar.translation}
                </p>
              </div>
              <div className="flex border-t border-[#3E4044]">
                <button
                  onClick={savePhrase}
                  className="flex-1 px-3 py-2.5 text-[12px] text-[#a855f7] hover:bg-[#a855f7]/10 transition-colors font-medium flex items-center justify-center gap-1.5"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-3.5 h-3.5"
                  >
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                  Save phrase
                </button>
                <button
                  onClick={() => {
                    setPhraseBar(null);
                    window.getSelection()?.removeAllRanges();
                  }}
                  className="px-3 py-2.5 text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors border-l border-[#3E4044]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* ─ Pre-translate state ─ */
            <div className="flex items-center">
              <div className="px-3 py-2 text-[12px] text-white/50 max-w-[180px] truncate">
                &ldquo;{phraseBar.text.slice(0, 35)}
                {phraseBar.text.length > 35 ? "…" : ""}&rdquo;
              </div>
              <button
                onClick={translatePhrase}
                disabled={isTranslatingPhrase}
                className="flex items-center gap-1.5 px-3 py-2.5 text-[12px] text-[#a855f7] hover:bg-[#a855f7]/10 transition-colors font-medium border-l border-[#3E4044] shrink-0"
              >
                {isTranslatingPhrase ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  "Translate"
                )}
              </button>
              <button
                onClick={() => {
                  setPhraseBar(null);
                  window.getSelection()?.removeAllRanges();
                }}
                className="px-2 py-2.5 text-white/30 hover:text-white/70 border-l border-[#3E4044]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
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
