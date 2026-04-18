import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, RefreshCw, BookOpen, Loader2, SlidersHorizontal, X, Lightbulb, MessageCircle, Globe, AlertTriangle, Volume2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { loadImportedPhraseBank, phraseBank, PhraseBankEntry } from "@/lib/phraseBank";
import { useToast } from "@/hooks/use-toast";
import { generateAIExplanation } from "@/lib/ai";
import { speakText } from "@/lib/tts";
import { AIGenerationResult, DifficultyLevel, PhraseType } from "@/types";

function normalizePhrase(text: string) {
  return text.trim().toLowerCase();
}

function isLookupCandidate(part: string) {
  return /^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(part);
}

function inferWordDifficulty(word: string): DifficultyLevel {
  if (word.length <= 5) return "beginner";
  if (word.length >= 10) return "advanced";
  return "intermediate";
}

function getRandomEntry(entries: PhraseBankEntry[], excludePhrase?: string) {
  if (entries.length === 0) return null;
  if (entries.length === 1) return entries[0];

  let next = entries[Math.floor(Math.random() * entries.length)];
  while (excludePhrase && normalizePhrase(next.phraseText) === normalizePhrase(excludePhrase)) {
    next = entries[Math.floor(Math.random() * entries.length)];
  }
  return next;
}

type BrowseMode = "vocabulary" | "phrases";

function isPhraseModeType(phraseType: PhraseType) {
  return phraseType !== "word";
}

export default function RandomPhrasesPage() {
  const { phrases, addPhrase } = usePhraseStore();
  const { toast } = useToast();
  const [currentPhrase, setCurrentPhrase] = useState<PhraseBankEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<AIGenerationResult | null>(null);
  const [lookupWord, setLookupWord] = useState<string | null>(null);
  const [lookupPreview, setLookupPreview] = useState<AIGenerationResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupSaving, setLookupSaving] = useState(false);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedWordPosition, setSelectedWordPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedWordSaving, setSelectedWordSaving] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [importedPhrases, setImportedPhrases] = useState<PhraseBankEntry[]>([]);
  const [importedSourceLabel, setImportedSourceLabel] = useState("No imported file loaded yet");
  const [bankLoading, setBankLoading] = useState(true);
  const [browseMode, setBrowseMode] = useState<BrowseMode>("vocabulary");
  const [onlyCommonWords, setOnlyCommonWords] = useState(true);
  const [includeImportedEntries, setIncludeImportedEntries] = useState(true);
  const [difficultyFilter, setDifficultyFilter] = useState<"all" | DifficultyLevel>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | PhraseType>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;

    async function loadBank() {
      setBankLoading(true);
      try {
        const data = await loadImportedPhraseBank();
        if (!active) return;
        setImportedPhrases(data.entries);
        setImportedSourceLabel(`${data.sourceLabel} · ${data.totalEntries.toLocaleString()} imported`);
      } catch (error) {
        if (!active) return;
        setImportedPhrases([]);
        setImportedSourceLabel("Imported file not found");
        toast({
          title: "Imported phrase bank not loaded",
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        if (active) {
          setBankLoading(false);
        }
      }
    }

    loadBank();

    return () => {
      active = false;
    };
  }, [toast]);

  const fullPhraseBank = useMemo(() => {
    const merged = includeImportedEntries ? [...phraseBank, ...importedPhrases] : [...phraseBank];
    const seen = new Set<string>();

    return merged.filter((entry) => {
      const key = normalizePhrase(entry.phraseText);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [importedPhrases, includeImportedEntries]);

  const availableCategories = useMemo(
    () => [...new Set(fullPhraseBank.map((entry) => entry.category))].sort(),
    [fullPhraseBank]
  );

  const savedPhrases = useMemo(
    () => new Set(phrases.map((phrase) => normalizePhrase(phrase.phraseText))),
    [phrases]
  );

  const unseenPhrases = useMemo(() => {
    return fullPhraseBank
      .filter((entry) => !savedPhrases.has(normalizePhrase(entry.phraseText)))
      .filter((entry) => (browseMode === "vocabulary" ? entry.phraseType === "word" : isPhraseModeType(entry.phraseType)))
      .filter((entry) => (browseMode === "vocabulary" && onlyCommonWords ? entry.isCommon !== false : true))
      .filter((entry) => (difficultyFilter === "all" ? true : entry.difficultyLevel === difficultyFilter))
      .filter((entry) => {
        if (browseMode === "vocabulary") return true;
        return typeFilter === "all" ? true : entry.phraseType === typeFilter;
      })
      .filter((entry) => (categoryFilter === "all" ? true : entry.category === categoryFilter));
  }, [fullPhraseBank, savedPhrases, browseMode, onlyCommonWords, difficultyFilter, typeFilter, categoryFilter]);

  useEffect(() => {
    if (unseenPhrases.length === 0) {
      setCurrentPhrase(null);
      setPreview(null);
      return;
    }

    const currentPhraseStillVisible = currentPhrase
      ? unseenPhrases.some((entry) => normalizePhrase(entry.phraseText) === normalizePhrase(currentPhrase.phraseText))
      : false;

    if (!currentPhraseStillVisible) {
      setCurrentPhrase(getRandomEntry(unseenPhrases));
      setPreview(null);
    }
  }, [currentPhrase, unseenPhrases]);

  const handleNextPhrase = () => {
    setCurrentPhrase((previous) => getRandomEntry(unseenPhrases, previous?.phraseText));
    setPreview(null);
  };

  const handlePreviewPhrase = async () => {
    if (!currentPhrase) return;

    setPreviewLoading(true);
    try {
      const result = await generateAIExplanation(currentPhrase.phraseText);
      setPreview(result);
    } catch (error) {
      toast({
        title: "Could not load explanation",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSavePhrase = async () => {
    if (!currentPhrase) return;

    setLoading(true);
    try {
      await addPhrase({
        phraseText: currentPhrase.phraseText,
        phraseType: currentPhrase.phraseType,
        category: currentPhrase.category,
        difficultyLevel: currentPhrase.difficultyLevel,
        notes: "Added from Random Phrases",
      }, preview ?? undefined);

      toast({
        title: "Phrase added",
        description: `"${currentPhrase.phraseText}" was saved with AI explanation.`,
      });

      const remaining = unseenPhrases.filter(
        (entry) => normalizePhrase(entry.phraseText) !== normalizePhrase(currentPhrase.phraseText)
      );
      setCurrentPhrase(getRandomEntry(remaining));
      setPreview(null);
    } catch (error) {
      toast({
        title: "Could not save phrase",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLookupWord = async (word: string) => {
    const cleanWord = word.trim().toLowerCase();
    if (!cleanWord) return;

    setLookupWord(cleanWord);
    setLookupPreview(null);
    setLookupLoading(true);
    try {
      const result = await generateAIExplanation(cleanWord);
      setLookupPreview(result);
    } catch (error) {
      toast({
        title: "Could not explain selected word",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLookupLoading(false);
    }
  };

  const playPhraseAudio = (text: string) => {
    void speakText(text).catch(() => {
      toast({
        title: "Could not play audio",
        description: "This audio file could not be played right now.",
        variant: "destructive",
      });
    });
  };

  const handleSaveSelectedWord = async () => {
    if (!selectedWord) return;

    setSelectedWordSaving(true);
    try {
      await addPhrase({
        phraseText: selectedWord,
        phraseType: "word",
        category: "Learning",
        difficultyLevel: inferWordDifficulty(selectedWord),
        notes: "Saved from explanation selection",
      });

      toast({
        title: "Word added",
        description: `"${selectedWord}" was saved to your vocabulary list.`,
      });

      setSelectedWord(null);
      setSelectedWordPosition(null);
      window.getSelection()?.removeAllRanges();
    } catch (error) {
      toast({
        title: "Could not save word",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSelectedWordSaving(false);
    }
  };

  const handleSaveLookupWord = async () => {
    if (!lookupWord || !lookupPreview) return;

    setLookupSaving(true);
    try {
      await addPhrase({
        phraseText: lookupWord,
        phraseType: "word",
        category: "Learning",
        difficultyLevel: inferWordDifficulty(lookupWord),
        notes: "Saved from explanation lookup",
      }, {
        ...lookupPreview,
        phraseType: "word",
      });

      toast({
        title: "Word added",
        description: `"${lookupWord}" was saved to your vocabulary list.`,
      });
    } catch (error) {
      toast({
        title: "Could not save word",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLookupSaving(false);
    }
  };

  const handleSelection = () => {
    const selection = window.getSelection();
    const rawText = selection?.toString().trim() ?? "";
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const containerNode = range?.commonAncestorContainer ?? null;
    const previewElement = previewRef.current;
    const isInsidePreview =
      previewElement &&
      containerNode &&
      previewElement.contains(containerNode.nodeType === Node.TEXT_NODE ? containerNode.parentNode : containerNode);

    if (!rawText || !isLookupCandidate(rawText) || rawText.length < 3 || !isInsidePreview) {
      setSelectedWord(null);
      setSelectedWordPosition(null);
      return;
    }

    const normalizedPart = normalizePhrase(rawText);
    const currentPhraseKey = currentPhrase ? normalizePhrase(currentPhrase.phraseText) : "";
    if (normalizedPart === currentPhraseKey) {
      setSelectedWord(null);
      setSelectedWordPosition(null);
      return;
    }

    setSelectedWord(normalizedPart);
    const rect = range?.getBoundingClientRect();
    if (rect) {
      const left = rect.left + rect.width / 2;
      const top = rect.top - 26;
      setSelectedWordPosition({
        top: Math.max(16, top),
        left: Math.min(window.innerWidth - 90, Math.max(90, left)),
      });
    }
  };

  const renderLookupText = (text: string) => {
    return <span className="whitespace-pre-wrap">{text}</span>;
  };

  const lookupAlreadySaved = lookupWord ? savedPhrases.has(normalizePhrase(lookupWord)) : false;
  const selectedWordAlreadySaved = selectedWord ? savedPhrases.has(normalizePhrase(selectedWord)) : false;

  useEffect(() => {
    const clearSelection = () => {
      setSelectedWord(null);
      setSelectedWordPosition(null);
    };

    const handleSelectionChange = () => {
      window.requestAnimationFrame(handleSelection);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    window.addEventListener("scroll", clearSelection, true);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      window.removeEventListener("scroll", clearSelection, true);
    };
  }, []);

  return (
    <>
    {/* ── Desktop layout ── */}
    <div className="hidden lg:block">
      <div className="app-page">
        <div className="page-stack max-w-6xl">
          <div>
            <p className="admin-kicker">Explore</p>
            <h1 className="admin-page-title">Random Learning</h1>
            <p className="admin-page-subtitle">
              Switch between vocabulary and phrases, then explore real imported entries you have not saved yet.
            </p>
          </div>

          <Tabs
            value={browseMode}
            onValueChange={(value) => {
              const nextMode = value as BrowseMode;
              setBrowseMode(nextMode);
              setPreview(null);
              if (nextMode === "vocabulary") {
                setTypeFilter("all");
              }
            }}
          >
            <TabsList className="grid h-14 w-full max-w-sm grid-cols-2 rounded-2xl border border-border bg-card/90 p-1">
              <TabsTrigger
                value="vocabulary"
                className="rounded-xl text-base font-semibold text-muted-foreground data-[state=active]:bg-primary/90 data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
              >
                Vocabulary
              </TabsTrigger>
              <TabsTrigger
                value="phrases"
                className="rounded-xl text-base font-semibold text-muted-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none"
              >
                Phrases
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-3 rounded-[1.4rem] border border-border bg-card/95 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)] backdrop-blur xl:grid-cols-[minmax(180px,0.9fr)_minmax(240px,1.15fr)_minmax(200px,0.95fr)_minmax(220px,1fr)_150px] xl:items-end">
            <div className="min-w-0">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Difficulty</p>
              <Select value={difficultyFilter} onValueChange={(value) => setDifficultyFilter(value as "all" | DifficultyLevel)}>
                <SelectTrigger className="h-10 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {browseMode === "phrases" ? (
              <div className="min-w-0">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Type</p>
                <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as "all" | PhraseType)}>
                  <SelectTrigger className="h-10 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Phrase Types</SelectItem>
                    <SelectItem value="phrase">Phrase</SelectItem>
                    <SelectItem value="phrasal_verb">Phrasal Verb</SelectItem>
                    <SelectItem value="idiom">Idiom</SelectItem>
                    <SelectItem value="expression">Expression</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="min-w-0">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Vocabulary</p>
                <div className="flex h-10 items-center justify-between gap-3 rounded-lg border px-3.5">
                  <Label htmlFor="common-words-toggle" className="min-w-0 flex-1 pr-2 text-[13px] font-medium leading-none text-foreground">
                    Only common words
                  </Label>
                  <Switch
                    id="common-words-toggle"
                    checked={onlyCommonWords}
                    onCheckedChange={setOnlyCommonWords}
                  />
                </div>
              </div>
            )}

            <div className="min-w-0">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Category</p>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-10 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {availableCategories.map((category) => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Source</p>
              <div className="flex h-10 items-center justify-between gap-3 rounded-lg border px-3.5">
                <Label htmlFor="imported-entries-toggle" className="min-w-0 flex-1 pr-2 text-[13px] font-medium leading-none text-foreground">
                  Imported decks
                </Label>
                <Switch
                  id="imported-entries-toggle"
                  checked={includeImportedEntries}
                  onCheckedChange={setIncludeImportedEntries}
                />
              </div>
            </div>

            <div className="min-w-0 xl:self-end">
              <Button
                variant="outline"
                className="h-10 w-full rounded-lg text-sm xl:min-w-[160px]"
                onClick={() => {
                  setDifficultyFilter("all");
                  setTypeFilter("all");
                  setCategoryFilter("all");
                  setOnlyCommonWords(true);
                  setIncludeImportedEntries(true);
                }}
              >
                Reset Filters
              </Button>
            </div>
          </div>

          {!currentPhrase ? (
            <div className="admin-panel p-10 text-center">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
              <h2 className="mt-4 text-xl font-semibold text-foreground">No phrases match these filters</h2>
              <p className="mt-2 text-muted-foreground">
                Try another level, type, or category. You may already have saved all phrases in this filter.
              </p>
            </div>
          ) : (
            <div className="admin-panel p-8">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {currentPhrase.phraseType.replace("_", " ")}
                </span>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                  {currentPhrase.category}
                </span>
                <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-foreground">
                  {currentPhrase.difficultyLevel}
                </span>
              </div>

              <div className="mt-6 space-y-3">
                <p className="text-sm uppercase tracking-wide text-muted-foreground">Try this next</p>
                <h2 className="text-4xl font-bold tracking-tight text-foreground">{currentPhrase.phraseText}</h2>
                {currentPhrase.sourceMeaning ? (
                  <p className="max-w-2xl text-sm text-muted-foreground">
                    Dictionary meaning: {renderLookupText(currentPhrase.sourceMeaning)}
                  </p>
                ) : null}
                {currentPhrase.sourceExample ? (
                  <p className="max-w-2xl text-sm text-muted-foreground">
                    Example: {renderLookupText(currentPhrase.sourceExample)}
                  </p>
                ) : null}
                {currentPhrase.sourceImages?.length ? (
                  <div className="overflow-hidden rounded-3xl border bg-muted/20">
                    <img
                      src={currentPhrase.sourceImages[0]}
                      alt={currentPhrase.phraseText}
                      className="h-64 w-full object-cover"
                    />
                  </div>
                ) : null}
                {(currentPhrase.sourceAudio?.length || currentPhrase.sourceImages?.length) ? (
                  <div className="flex flex-wrap gap-2">
                    {currentPhrase.sourceAudio?.length ? (
                      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => playPhraseAudio(currentPhrase.phraseText)}>
                        <Volume2 className="h-4 w-4" />
                        Hear phrase
                      </Button>
                    ) : null}
                    {currentPhrase.sourceImages?.length ? (
                      <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
                        <ImageIcon className="h-3.5 w-3.5" />
                        {currentPhrase.sourceImages.length} image{currentPhrase.sourceImages.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button onClick={handlePreviewPhrase} variant="outline" className="gap-2" disabled={previewLoading || loading}>
                  {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                  {preview ? "Refresh Meaning" : "Show Meaning"}
                </Button>
                <Button onClick={handleSavePhrase} className="gap-2" disabled={loading}>
                  <Sparkles className="h-4 w-4" />
                  {loading ? "Saving with AI..." : "Explain & Save"}
                </Button>
                <Button onClick={handleNextPhrase} variant="outline" className="gap-2" disabled={loading || unseenPhrases.length <= 1}>
                  <RefreshCw className="h-4 w-4" />
                  Another Random Phrase
                </Button>
              </div>

              <p className="mt-4 text-sm text-muted-foreground">
                This entry comes from your imported bank. Select an unknown word in the explanation, then use Learn this word.
              </p>
            </div>
          )}

          {preview && currentPhrase && (
            <div ref={previewRef} className="admin-panel space-y-4 p-8">
              <div>
                <h3 className="text-xl font-semibold text-foreground">{currentPhrase.phraseText}</h3>
                <p className="text-sm text-muted-foreground">Full explanation preview</p>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="space-y-4">
                  <div className="rounded-2xl border p-5">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <h4 className="font-semibold text-foreground">Standard Meaning</h4>
                    </div>
                    <p className="mt-3 text-foreground">{renderLookupText(preview.standardMeaning)}</p>
                  </div>

                  <div className="rounded-2xl border p-5">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-primary" />
                      <h4 className="font-semibold text-foreground">Easy Meaning</h4>
                    </div>
                    <p className="mt-3 text-foreground">{renderLookupText(preview.easyMeaning)}</p>
                  </div>

                  <div className="rounded-2xl border p-5">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-primary" />
                      <h4 className="font-semibold text-foreground">When People Use This</h4>
                    </div>
                    <p className="mt-3 text-foreground">{renderLookupText(preview.usageContext)}</p>
                  </div>

                  <div className="rounded-2xl border p-5">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-primary" />
                      <h4 className="font-semibold text-foreground">Common Mistake</h4>
                    </div>
                    <p className="mt-3 text-foreground">{renderLookupText(preview.commonMistake)}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border p-5">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-primary" />
                      <h4 className="font-semibold text-foreground">AI Explanation</h4>
                    </div>
                    <p className="mt-3 text-foreground">{renderLookupText(preview.aiExplanation)}</p>
                  </div>

                  <div className="rounded-2xl border p-5">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <h4 className="font-semibold text-foreground">Examples</h4>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {preview.examples.map((example, index) => (
                        <li key={index} className="text-foreground">
                          <span className="font-medium">{example.type}:</span> {renderLookupText(example.text)}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-2xl border p-5">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      <h4 className="font-semibold text-foreground">Somali Support</h4>
                    </div>
                    <div className="mt-3 space-y-2 text-foreground">
                      <p><span className="font-medium">Meaning:</span> {renderLookupText(preview.somaliMeaning)}</p>
                      <p><span className="font-medium">Explanation:</span> {renderLookupText(preview.somaliExplanation)}</p>
                      <p><span className="font-medium">Example:</span> {renderLookupText(preview.somaliSentence)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedWord && selectedWordPosition ? (
            <div
              className="fixed z-50 hidden -translate-x-1/2 -translate-y-full sm:block"
              style={{ top: selectedWordPosition.top, left: selectedWordPosition.left }}
            >
              <div className="relative">
                <div className="flex items-center gap-1 rounded-lg border bg-background/95 p-0.5 shadow-lg backdrop-blur">
                  <button
                    type="button"
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void handleLookupWord(selectedWord)}
                  >
                    Learn
                  </button>
                  <button
                    type="button"
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void handleSaveSelectedWord()}
                    disabled={selectedWordSaving || selectedWordAlreadySaved}
                  >
                    {selectedWordAlreadySaved ? "Saved" : selectedWordSaving ? "Saving..." : "Save"}
                  </button>
                </div>
                <div className="absolute left-1/2 top-full h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r bg-background/95 shadow-sm" />
              </div>
            </div>
          ) : null}

          {selectedWord ? (
            <div className="fixed inset-x-4 bottom-4 z-40 flex justify-center sm:hidden">
              <div className="flex w-full max-w-md items-center justify-between gap-2 rounded-2xl border bg-background/95 p-2 shadow-lg backdrop-blur">
                <p className="truncate px-2 text-sm text-foreground">
                  <span className="font-medium">Selected:</span> {selectedWord}
                </p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => void handleLookupWord(selectedWord)}>
                    Learn
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void handleSaveSelectedWord()}
                    disabled={selectedWordSaving || selectedWordAlreadySaved}
                  >
                    {selectedWordAlreadySaved ? "Saved" : selectedWordSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <Dialog open={Boolean(lookupWord)} onOpenChange={(open) => {
            if (!open) {
              setLookupWord(null);
              setLookupPreview(null);
            }
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{lookupWord ? `Learn "${lookupWord}"` : "Learn word"}</DialogTitle>
                <DialogDescription>
                  Tap any unknown word in an explanation or example to open this quick lookup.
                </DialogDescription>
              </DialogHeader>

              {lookupLoading ? (
                <div className="flex items-center gap-2 rounded-xl border p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading word explanation...
                </div>
              ) : lookupPreview ? (
                <div className="space-y-4">
                  <div className="rounded-xl border p-4">
                    <p className="text-sm font-medium text-muted-foreground">Standard Meaning</p>
                    <p className="mt-2 text-foreground">{lookupPreview.standardMeaning}</p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-sm font-medium text-muted-foreground">Easy Meaning</p>
                    <p className="mt-2 text-foreground">{lookupPreview.easyMeaning}</p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-sm font-medium text-muted-foreground">Explanation</p>
                    <p className="mt-2 text-foreground">{lookupPreview.aiExplanation}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border p-4 text-sm text-muted-foreground">
                  Select a word to load its explanation.
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setLookupWord(null);
                  setLookupPreview(null);
                }}>
                  Close
                </Button>
                <Button
                  onClick={() => void handleSaveLookupWord()}
                  disabled={!lookupPreview || !lookupWord || lookupSaving || lookupAlreadySaved}
                >
                  {lookupAlreadySaved ? "Already Saved" : lookupSaving ? "Saving..." : "Save Word"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>

    {/* ── Mobile layout ── */}
    <div className="fixed inset-x-0 top-16 bottom-0 flex flex-col bg-background lg:hidden">
      {/* Filters trigger */}
      <button onClick={() => setShowFilters(true)} className="absolute right-5 top-6 z-10 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
      </button>

      {/* Bottom sheet */}
      {showFilters && (
        <>
          <div className="fixed inset-0 z-20 bg-black/40" onClick={() => setShowFilters(false)} />
          <div className="fixed inset-x-0 bottom-0 z-30 rounded-t-3xl bg-card px-6 pb-10 pt-5 animate-in slide-in-from-bottom-4 duration-300">
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted-foreground/20" />
            <div className="mb-5 flex items-center justify-between">
              <p className="text-base font-semibold text-foreground">Filters</p>
              <button onClick={() => setShowFilters(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-5">
              <div>
                <p className="mb-2.5 text-xs font-medium text-muted-foreground">Mode</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["vocabulary", "phrases"] as BrowseMode[]).map(m => (
                    <button key={m} onClick={() => { setBrowseMode(m); setPreview(null); if (m === "vocabulary") setTypeFilter("all"); }} className={`rounded-2xl border py-2.5 text-sm font-medium capitalize transition-colors ${browseMode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{m}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2.5 text-xs font-medium text-muted-foreground">Difficulty</p>
                <div className="flex flex-wrap gap-2">
                  {(["all", "beginner", "intermediate", "advanced"] as Array<"all" | DifficultyLevel>).map(l => (
                    <button key={l} onClick={() => setDifficultyFilter(l)} className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${difficultyFilter === l ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{l === "all" ? "All Levels" : l}</button>
                  ))}
                </div>
              </div>
              {browseMode === "phrases" && (
                <div>
                  <p className="mb-2.5 text-xs font-medium text-muted-foreground">Type</p>
                  <div className="flex flex-wrap gap-2">
                    {(["all", "phrase", "phrasal_verb", "idiom", "expression"] as Array<"all" | PhraseType>).map(t => (
                      <button key={t} onClick={() => setTypeFilter(t)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${typeFilter === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{t === "all" ? "All Types" : t.replace("_", " ")}</button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="mb-2.5 text-xs font-medium text-muted-foreground">Category</p>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {availableCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
                <span className="text-sm text-foreground">Imported decks</span>
                <Switch checked={includeImportedEntries} onCheckedChange={setIncludeImportedEntries} />
              </div>
              {browseMode === "vocabulary" && (
                <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
                  <span className="text-sm text-foreground">Common words only</span>
                  <Switch checked={onlyCommonWords} onCheckedChange={setOnlyCommonWords} />
                </div>
              )}
              {(difficultyFilter !== "all" || typeFilter !== "all" || categoryFilter !== "all" || !onlyCommonWords || !includeImportedEntries) && (
                <button onClick={() => { setDifficultyFilter("all"); setTypeFilter("all"); setCategoryFilter("all"); setOnlyCommonWords(true); setIncludeImportedEntries(true); }} className="w-full rounded-2xl border border-border py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">Reset filters</button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-4">
        {!currentPhrase ? (
          <div className="flex min-h-screen flex-col items-center justify-center px-8 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground" />
            <p className="mt-4 text-base font-semibold text-foreground">No phrases match these filters</p>
            <p className="mt-1 text-sm text-muted-foreground">Try adjusting your filters.</p>
          </div>
        ) : (
          <>
            <div className="mx-auto flex w-full max-w-sm flex-col px-6 pb-8 pt-10">
              <p className="mb-4 text-center text-[11px] font-medium tracking-wide text-muted-foreground/55">
                {currentPhrase.phraseType.replace("_", " ")} · {currentPhrase.category} · {currentPhrase.difficultyLevel}
              </p>
              <h1 className="text-center text-[clamp(3.1rem,16vw,4.8rem)] font-bold leading-[0.9] tracking-[-0.04em] text-foreground">
                {currentPhrase.phraseText}
              </h1>
              {currentPhrase.sourceMeaning && (
                <p className="mx-auto mt-4 max-w-[18rem] text-center text-sm leading-relaxed text-muted-foreground">
                  {renderLookupText(currentPhrase.sourceMeaning)}
                </p>
              )}
              {currentPhrase.sourceExample && (
                <p className="mx-auto mt-2 max-w-[18rem] text-center text-sm leading-relaxed text-muted-foreground">
                  {renderLookupText(currentPhrase.sourceExample)}
                </p>
              )}
              {currentPhrase.sourceImages?.length ? (
                <div className="mt-6 overflow-hidden rounded-[1.75rem] border bg-muted/20">
                  <img src={currentPhrase.sourceImages[0]} alt={currentPhrase.phraseText} className="h-48 w-full object-cover" />
                </div>
              ) : null}
              {(currentPhrase.sourceAudio?.length || currentPhrase.sourceImages?.length) ? (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {currentPhrase.sourceAudio?.length ? (
                    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => playPhraseAudio(currentPhrase.phraseText)}>
                      <Volume2 className="h-4 w-4" />
                      Hear phrase
                    </Button>
                  ) : null}
                  {currentPhrase.sourceImages?.length ? (
                    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
                      <ImageIcon className="h-3.5 w-3.5" />
                      {currentPhrase.sourceImages.length} image{currentPhrase.sourceImages.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {!preview && !previewLoading && (
                <button onClick={handlePreviewPhrase} className="mx-auto mt-6 flex items-center gap-1.5 text-sm text-muted-foreground/50 transition-colors hover:text-muted-foreground">
                  <BookOpen className="h-3.5 w-3.5" /> Show meaning
                </button>
              )}
              {previewLoading && (
                <div className="mx-auto mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                </div>
              )}
            </div>

            {preview && (
              <div ref={previewRef} className="mx-auto mt-2 flex w-full max-w-sm flex-col gap-7 px-6 pb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">Easy meaning</p>
                  <p className="text-[1.05rem] leading-8 text-foreground/92">{renderLookupText(preview.easyMeaning)}</p>
                </div>
                <div className="border-t border-border/50" />
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">Standard meaning</p>
                  <p className="text-[1.05rem] leading-8 text-foreground/92">{renderLookupText(preview.standardMeaning)}</p>
                </div>
                <div className="border-t border-border/50" />
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">AI explanation</p>
                  <p className="text-[1.05rem] leading-8 text-foreground/92">{renderLookupText(preview.aiExplanation)}</p>
                </div>
                <div className="border-t border-border/50" />
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">When people use this</p>
                  <p className="text-[1.05rem] leading-8 text-foreground/92">{renderLookupText(preview.usageContext)}</p>
                </div>
                <div className="border-t border-border/50" />
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">Common mistake</p>
                  <p className="text-[1.05rem] leading-8 text-foreground/92">{renderLookupText(preview.commonMistake)}</p>
                </div>
                <div className="border-t border-border/50" />
                <div>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">Examples</p>
                  <div className="space-y-3">
                    {preview.examples.map((ex, i) => (
                      <p key={i} className="text-[1.05rem] leading-8 text-foreground/84">
                        <span className="font-medium text-muted-foreground">{ex.type}:</span> {renderLookupText(ex.text)}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="border-t border-border/50" />
                <div>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">Somali</p>
                  <div className="space-y-2">
                    <p className="text-[1.05rem] leading-8 text-foreground/84"><span className="font-medium text-muted-foreground">Macnaha:</span> {renderLookupText(preview.somaliMeaning)}</p>
                    <p className="text-[1.05rem] leading-8 text-foreground/84"><span className="font-medium text-muted-foreground">Sharaxaad:</span> {renderLookupText(preview.somaliExplanation)}</p>
                    <p className="text-[1.05rem] leading-8 text-foreground/84"><span className="font-medium text-muted-foreground">Tusaale:</span> {renderLookupText(preview.somaliSentence)}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-border/60 bg-background px-4 pb-1 pt-1">
        <div className="mx-auto flex w-full max-w-sm items-center gap-3">
          <Button
            onClick={handleNextPhrase}
            variant="outline"
            className="h-11 flex-1 rounded-2xl"
            disabled={loading || unseenPhrases.length <= 1}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Skip
          </Button>
          <Button
            onClick={handleSavePhrase}
            className="h-11 flex-1 rounded-2xl"
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {loading ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {selectedWord && selectedWordPosition ? (
          <div
            className="fixed z-50 hidden -translate-x-1/2 -translate-y-full sm:block"
            style={{ top: selectedWordPosition.top, left: selectedWordPosition.left }}
          >
            <div className="relative">
              <div className="flex items-center gap-1 rounded-lg border bg-background/95 p-0.5 shadow-lg backdrop-blur">
                <button
                  type="button"
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void handleLookupWord(selectedWord)}
                >
                  Learn
                </button>
                <button
                  type="button"
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void handleSaveSelectedWord()}
                  disabled={selectedWordSaving || selectedWordAlreadySaved}
                >
                  {selectedWordAlreadySaved ? "Saved" : selectedWordSaving ? "Saving..." : "Save"}
                </button>
              </div>
              <div className="absolute left-1/2 top-full h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r bg-background/95 shadow-sm" />
            </div>
          </div>
        ) : null}

        {selectedWord ? (
          <div className="fixed inset-x-4 bottom-4 z-40 flex justify-center sm:hidden">
            <div className="flex w-full max-w-md items-center justify-between gap-2 rounded-2xl border bg-background/95 p-2 shadow-lg backdrop-blur">
              <p className="truncate px-2 text-sm text-foreground">
                <span className="font-medium">Selected:</span> {selectedWord}
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void handleLookupWord(selectedWord)}>
                  Learn
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleSaveSelectedWord()}
                  disabled={selectedWordSaving || selectedWordAlreadySaved}
                >
                  {selectedWordAlreadySaved ? "Saved" : selectedWordSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <Dialog open={Boolean(lookupWord)} onOpenChange={(open) => {
          if (!open) {
            setLookupWord(null);
            setLookupPreview(null);
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{lookupWord ? `Learn "${lookupWord}"` : "Learn word"}</DialogTitle>
              <DialogDescription>
                Tap any unknown word in an explanation or example to open this quick lookup.
              </DialogDescription>
            </DialogHeader>

            {lookupLoading ? (
              <div className="flex items-center gap-2 rounded-xl border p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading word explanation...
              </div>
            ) : lookupPreview ? (
              <div className="space-y-4">
                <div className="rounded-xl border p-4">
                  <p className="text-sm font-medium text-muted-foreground">Standard Meaning</p>
                  <p className="mt-2 text-foreground">{lookupPreview.standardMeaning}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-sm font-medium text-muted-foreground">Easy Meaning</p>
                  <p className="mt-2 text-foreground">{lookupPreview.easyMeaning}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-sm font-medium text-muted-foreground">Explanation</p>
                  <p className="mt-2 text-foreground">{lookupPreview.aiExplanation}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border p-4 text-sm text-muted-foreground">
                Select a word to load its explanation.
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setLookupWord(null);
                setLookupPreview(null);
              }}>
                Close
              </Button>
              <Button
                onClick={() => void handleSaveLookupWord()}
                disabled={!lookupPreview || !lookupWord || lookupSaving || lookupAlreadySaved}
              >
                {lookupAlreadySaved ? "Already Saved" : lookupSaving ? "Saving..." : "Save Word"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
    </>
  );
}
