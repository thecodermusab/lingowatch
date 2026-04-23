import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, Search, Trash2, Volume2, Waves, BookmarkPlus } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteUploadedPhraseBank, ImportedPhraseBankPayload, loadUploadedPhraseBankById } from "@/lib/data/phraseBank";
import { useToast } from "@/hooks/use-toast";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { PhraseType } from "@/types";

const PAGE_SIZE = 12;
type EntryFilter = "all" | "with_details" | "media_only" | "saved";

export default function ImportedDeckDetailPage() {
  const { deckId = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { phrases, addPhrase } = usePhraseStore();
  const [deck, setDeck] = useState<ImportedPhraseBankPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [entryFilter, setEntryFilter] = useState<EntryFilter>("with_details");
  const [page, setPage] = useState(() => loadPersistedPage(deckId));
  const [savingWord, setSavingWord] = useState<string | null>(null);

  const savedPhraseKeys = useMemo(
    () => new Set(phrases.map((phrase) => normalizePhraseKey(phrase.phraseText))),
    [phrases]
  );

  useEffect(() => {
    setPage(loadPersistedPage(deckId));
  }, [deckId]);

  useEffect(() => {
    if (!deckId) return;
    try {
      localStorage.setItem(LAST_OPENED_IMPORTED_DECK_KEY, deckId);
    } catch {
      // Ignore storage failures.
    }
  }, [deckId]);

  useEffect(() => {
    let active = true;

    async function loadDeck() {
      setLoading(true);
      try {
        const result = await loadUploadedPhraseBankById(deckId);
        if (!active) return;
        setDeck(result);
      } catch (error) {
        if (!active) return;
        setDeck(null);
        toast({
          title: "Could not load uploaded deck",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        if (active) setLoading(false);
      }
    }

    if (deckId) {
      void loadDeck();
    }

    return () => {
      active = false;
    };
  }, [deckId, toast]);

  const filteredEntries = useMemo(() => {
    if (!deck) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return deck.entries.filter((entry) => {
      const isSaved = savedPhraseKeys.has(normalizePhraseKey(entry.phraseText));
      if (entryFilter === "with_details" && !hasDetails(entry)) return false;
      if (entryFilter === "media_only" && hasDetails(entry)) return false;
      if (entryFilter === "saved" && !isSaved) return false;
      if (!normalizedQuery) return true;

      const haystacks = [
        entry.phraseText,
        entry.sourcePhonetic,
        entry.sourceMeaning,
        entry.sourceExample,
        entry.category,
        entry.difficultyLevel,
      ];

      return haystacks.some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
    });
  }, [deck, entryFilter, query, savedPhraseKeys]);

  useEffect(() => {
    setPage(1);
  }, [query, entryFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleEntries = filteredEntries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    localStorage.setItem(getPageStorageKey(deckId), String(safePage));
  }, [deckId, safePage]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "ArrowRight" && safePage < totalPages) {
        event.preventDefault();
        setPage((current) => Math.min(totalPages, current + 1));
      }

      if (event.key === "ArrowLeft" && safePage > 1) {
        event.preventDefault();
        setPage((current) => Math.max(1, current - 1));
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [safePage, totalPages]);

  const handleDelete = async () => {
    if (!deck) return;
    setDeleting(true);
    try {
      await deleteUploadedPhraseBank(deckId);
      setDeleteDialogOpen(false);
      toast({ title: "Uploaded deck deleted" });
      navigate("/imported-deck");
    } catch (error) {
      toast({
        title: "Could not delete uploaded deck",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const playAudio = (url: string) => {
    const audio = new Audio(url);
    void audio.play().catch(() => {
      toast({
        title: "Could not play audio",
        description: "This audio file could not be played right now.",
        variant: "destructive",
      });
    });
  };

  const handleSaveToLibrary = async (entry: ImportedPhraseBankPayload["entries"][number]) => {
    const entryKey = normalizePhraseKey(entry.phraseText);
    if (savedPhraseKeys.has(entryKey)) return;

    setSavingWord(entryKey);
    try {
      await addPhrase({
        phraseText: entry.phraseText,
        phraseType: normalizePhraseType(entry.phraseType),
        category: "Imported Deck",
        difficultyLevel: entry.difficultyLevel,
        notes: buildImportedNotes(entry),
      });

      toast({
        title: "Saved to Library",
        description: `"${entry.phraseText}" is now in your Library with AI explanation.`,
      });
    } catch (error) {
      toast({
        title: "Could not save word",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingWord(null);
    }
  };

  return (
    <div className="w-full px-4 py-8 lg:px-6 xl:px-8">
      <div className="w-full max-w-none space-y-4">
        {loading ? (
          <div className="admin-panel admin-panel-body flex min-h-[320px] items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading uploaded deck...
          </div>
        ) : !deck ? (
          <div className="admin-panel admin-panel-body flex min-h-[320px] flex-col items-center justify-center text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold text-foreground">Deck not found</h2>
            <Button asChild className="mt-5 rounded-xl">
              <Link to="/imported-deck">Back to Uploads</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="py-1">
              <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
                <div className="flex items-center justify-start">
                  <Button asChild variant="ghost" size="sm" className="h-8 rounded-lg px-2.5 text-muted-foreground hover:text-foreground">
                    <Link to="/imported-deck?all=1">
                      <ChevronLeft className="h-4 w-4" />
                      Back
                    </Link>
                  </Button>
                </div>
                <div className="flex items-center justify-center gap-2 md:justify-self-center">
                  <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full px-2.5" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage <= 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[68px] text-center text-sm font-medium text-foreground">{safePage} / {totalPages}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full px-2.5" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage >= totalPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center justify-start gap-2 md:justify-self-end">
                <Button asChild variant="outline" size="sm" className="h-9 rounded-xl px-3">
                  <Link to="/imported-deck?all=1">Uploads</Link>
                </Button>
                <Button type="button" variant="destructive" size="sm" className="h-9 rounded-xl px-3" onClick={() => setDeleteDialogOpen(true)} disabled={deleting}>
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete
                </Button>
                <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setSearchOpen(true)} aria-label="Search imported entries">
                  <Search className="h-4 w-4" />
                </Button>
                </div>
              </div>
            </div>

            {filteredEntries.length === 0 ? (
              <div className="rounded-[1.25rem] border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">No imported entries match this search.</div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {visibleEntries.map((entry) => {
                    const saved = savedPhraseKeys.has(normalizePhraseKey(entry.phraseText));
                    const saving = savingWord === normalizePhraseKey(entry.phraseText);

                    return (
                      <article key={`${entry.phraseText}-${entry.difficultyLevel}`} className="overflow-hidden rounded-[1.1rem] border border-border/70 bg-card/95 shadow-[0_8px_20px_rgba(0,0,0,0.10)]">
                        <div className="relative border-b border-border/60 bg-muted/10">
                          {entry.sourceImages?.[0] ? (
                            <div className="flex aspect-[5/4] items-center justify-center overflow-hidden bg-slate-50/70 p-3 dark:bg-slate-950/30">
                              <img src={entry.sourceImages[0]} alt={entry.phraseText} className="h-full w-full object-contain" />
                            </div>
                          ) : (
                            <div className="flex aspect-[5/4] items-center justify-center bg-muted/20 text-sm text-muted-foreground">No image</div>
                          )}
                        </div>

                        <div className="space-y-3 p-3.5">
                          <div className="space-y-1.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h2 className="truncate text-base font-semibold tracking-tight text-foreground">{entry.phraseText}</h2>
                                {entry.sourcePhonetic ? <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{entry.sourcePhonetic}</p> : null}
                              </div>
                              <div className="shrink-0">
                                <Button type="button" variant={saved ? "secondary" : "outline"} size="sm" className="h-8 rounded-lg px-2.5" onClick={() => void handleSaveToLibrary(entry)} disabled={saved || saving}>
                                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
                                </Button>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Pill>{entry.phraseType.replace("_", " ")}</Pill>
                              <Pill>{entry.difficultyLevel}</Pill>
                              {saved ? <Pill>Saved</Pill> : null}
                            </div>
                          </div>

                          <div className="grid gap-3">
                            {getEntrySections(entry).map((section) => (
                              <section key={`${entry.phraseText}-${section.label}`} className={`rounded-[0.9rem] border p-2.5 ${section.toneClass}`}>
                                <p className={`text-[10px] font-medium uppercase tracking-[0.16em] ${section.labelClass}`}>{section.label}</p>
                                <p className="mt-1.5 text-[13px] leading-5 text-foreground" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{section.value}</p>
                              </section>
                            ))}
                            {!entry.sourceMeaning && !entry.sourceExample && entry.sourcePhonetic ? (
                              <section className="rounded-[0.9rem] border border-border/70 bg-muted/15 p-2.5">
                                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                  <Waves className="h-4 w-4" />
                                  Pronunciation
                                </div>
                                <p className="mt-1.5 font-mono text-[11px] text-foreground">{entry.sourcePhonetic}</p>
                              </section>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-2.5">
                            {entry.sourceAudio?.map((url, index) => (
                              <Button key={url} type="button" variant="outline" size="sm" className="h-8 rounded-lg px-2.5 text-[11px]" onClick={() => playAudio(url)}>
                                <Volume2 className="h-3.5 w-3.5" />
                                {shortAudioLabel(entry, url, index)}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader className="space-y-2">
            <DialogTitle>Search this deck</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search imported entries"
                className="h-11 rounded-xl pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "with_details", label: "With details" },
                { key: "all", label: "All" },
                { key: "media_only", label: "Media only" },
                { key: "saved", label: "Saved" },
              ].map((filterOption) => (
                <button
                  key={filterOption.key}
                  type="button"
                  onClick={() => setEntryFilter(filterOption.key as EntryFilter)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    entryFilter === filterOption.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }`}
                >
                  {filterOption.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {filteredEntries.length.toLocaleString()} {filteredEntries.length === 1 ? "entry" : "entries"} match
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!deleting) {
            setDeleteDialogOpen(open);
          }
        }}
        onConfirm={() => void handleDelete()}
        title="Delete uploaded deck?"
        description={deck ? `Delete "${deck.sourceLabel}" and all extracted media from your uploads?` : ""}
        confirmLabel="Delete deck"
        isPending={deleting}
      />
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">{children}</span>;
}

function hasDetails(entry: ImportedPhraseBankPayload["entries"][number]) {
  return Boolean(entry.sourceMeaning || entry.sourceExample);
}

function normalizePhraseKey(text: string) {
  return text.trim().toLowerCase();
}

function normalizePhraseType(value: string): PhraseType {
  if (value === "word" || value === "phrase" || value === "phrasal_verb" || value === "idiom" || value === "expression") {
    return value;
  }
  return "word";
}

function buildImportedNotes(entry: ImportedPhraseBankPayload["entries"][number]) {
  const parts = [
    ...getEntrySections(entry).map((section) => `${section.label}: ${section.value}`),
    entry.sourcePhonetic ? `Pronunciation: ${entry.sourcePhonetic}` : "",
    "Imported from uploaded Anki deck",
  ].filter(Boolean);

  return parts.join("\n");
}

function shortAudioLabel(entry: ImportedPhraseBankPayload["entries"][number], url: string, index: number) {
  if (looksLikeInflectionForms(entry.sourceMeaning || "", entry.phraseText)) {
    const labels = getFormAudioLabels(entry.sourceAudio?.length || 0);
    return labels[index] || `Audio ${index + 1}`;
  }

  if (url.includes("_meaning")) return "Meaning";
  if (url.includes("_example")) return "Example";
  return index === 0 ? "Word" : `Audio ${index + 1}`;
}

function getFormAudioLabels(count: number) {
  if (count <= 1) return ["Base"];
  if (count === 2) return ["Base", "Form 2/3"];
  return ["Base", "Form 2", "Form 3"];
}

function getEntrySections(entry: ImportedPhraseBankPayload["entries"][number]) {
  const sections: Array<{ label: string; value: string; toneClass: string; labelClass: string }> = [];
  const pushSection = (label: string, value: string, tone: "emerald" | "sky" | "amber" | "slate" = "slate") => {
    if (!value) return;
    const normalizedKey = `${label.toLowerCase()}::${value.trim().toLowerCase()}`;
    if (sections.some((section) => `${section.label.toLowerCase()}::${section.value.trim().toLowerCase()}` === normalizedKey)) {
      return;
    }

    const toneMap = {
      emerald: {
        toneClass: "border-emerald-500/20 bg-emerald-500/[0.05]",
        labelClass: "text-emerald-700 dark:text-emerald-300",
      },
      sky: {
        toneClass: "border-sky-500/20 bg-sky-500/[0.05]",
        labelClass: "text-sky-700 dark:text-sky-300",
      },
      amber: {
        toneClass: "border-amber-500/20 bg-amber-500/[0.05]",
        labelClass: "text-amber-700 dark:text-amber-300",
      },
      slate: {
        toneClass: "border-border/70 bg-muted/15",
        labelClass: "text-muted-foreground",
      },
    } as const;

    sections.push({
      label,
      value,
      toneClass: toneMap[tone].toneClass,
      labelClass: toneMap[tone].labelClass,
    });
  };

  if (entry.sourceMeaning) {
    pushSection(inferPrimaryLabel("meaning", entry), entry.sourceMeaning, "emerald");
  }
  if (entry.sourceExample) {
    pushSection(inferPrimaryLabel("example", entry), entry.sourceExample, "sky");
  }
  for (const field of entry.sourceExtraFields || []) {
    pushSection(normalizeImportedFieldLabel(field.label), field.value, "amber");
  }

  return sections;
}

function inferPrimaryLabel(kind: "meaning" | "example", entry: ImportedPhraseBankPayload["entries"][number]) {
  const value = kind === "meaning" ? entry.sourceMeaning || "" : entry.sourceExample || "";
  if (!value) {
    return kind === "meaning" ? "Meaning" : "Example";
  }

  if (kind === "meaning" && looksLikeInflectionForms(value, entry.phraseText)) {
    return "Forms";
  }

  if (kind === "example" && looksLikeDefinition(value)) {
    return "Definition";
  }

  return kind === "meaning" ? "Meaning" : "Example";
}

function looksLikeInflectionForms(value: string, phraseText: string) {
  const cleaned = String(value || "").replace(/\*/g, "").trim().toLowerCase();
  const phrase = String(phraseText || "").trim().toLowerCase();
  if (!cleaned || !phrase) {
    return false;
  }

  const parts = cleaned.split(/\s*-\s*/).filter(Boolean);
  return parts.length >= 2 && parts.some((part) => part === phrase);
}

function looksLikeDefinition(value: string) {
  const lower = String(value || "").trim().toLowerCase();
  return /^(to|a|an)\s/.test(lower);
}

function normalizeImportedFieldLabel(label: string) {
  const cleaned = String(label || "").replace(/[_-]+/g, " ").trim();
  if (!cleaned) {
    return "Details";
  }

  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getPageStorageKey(deckId: string) {
  return `lingowatch-imported-deck-page:${deckId}`;
}

const LAST_OPENED_IMPORTED_DECK_KEY = "lingowatch-last-opened-imported-deck";

function loadPersistedPage(deckId: string) {
  try {
    const rawValue = localStorage.getItem(getPageStorageKey(deckId));
    const parsed = Number(rawValue);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  } catch {
    return 1;
  }
}
