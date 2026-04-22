import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Globe,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  MessageCircle,
  RefreshCw,
  Sparkles,
  Stars,
  Volume2,
  WandSparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { useToast } from "@/hooks/use-toast";
import { generateAIExplanation, generateRandomPhraseEntries } from "@/lib/ai";
import { ensureRuntimeTtsAsset, getPlayableAudioUrl, playRuntimeTtsAsset } from "@/lib/ttsAssets";
import { primeAudioUrl } from "@/lib/audioPlayback";
import { loadImportedPhraseBank, phraseBank, PhraseBankEntry } from "@/lib/phraseBank";
import { translateText } from "@/lib/googleTranslate";
import { AIGenerationResult, DifficultyLevel, PhraseAudioAsset, PhraseType } from "@/types";

type BrowseMode = "vocabulary" | "phrases";
type EntrySource = "built_in" | "imported" | "ai";
type SkipReason = "too_easy" | "already_know_it" | "not_useful";

interface DiscoveryEntry extends PhraseBankEntry {
  entrySource: EntrySource;
  sourceLabel: string;
  sourceMeaning?: string;
  sourceExample?: string;
  sourceAudio?: string[];
  sourceImages?: string[];
  relatedPhrases?: string[];
}

interface RandomFeedbackState {
  recentKeys: string[];
  phraseBias: Record<string, number>;
  categoryBias: Record<string, number>;
  typeBias: Record<string, number>;
  difficultyBias: Record<string, number>;
  skipReasons: Record<string, SkipReason>;
}

const FEEDBACK_STORAGE_KEY = "lingowatch_random_feedback_v2";
const RECENT_HISTORY_LIMIT = 18;
const TOKEN_PATTERN = /[A-Za-z]+(?:['-][A-Za-z]+)*/g;
const SKIP_REASON_COPY: Record<SkipReason, string> = {
  too_easy: "Too easy",
  already_know_it: "Already know it",
  not_useful: "Not useful",
};

function normalizePhrase(text: string) {
  return text.trim().toLowerCase();
}

function isLookupCandidate(part: string) {
  return /^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(part);
}

function isPhraseModeType(phraseType: PhraseType) {
  return phraseType !== "word";
}

function inferWordDifficulty(word: string): DifficultyLevel {
  if (word.length <= 5) return "beginner";
  if (word.length >= 10) return "advanced";
  return "intermediate";
}

function loadFeedbackState(): RandomFeedbackState {
  if (typeof window === "undefined") {
    return {
      recentKeys: [],
      phraseBias: {},
      categoryBias: {},
      typeBias: {},
      difficultyBias: {},
      skipReasons: {},
    };
  }

  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (!raw) throw new Error("missing");
    const parsed = JSON.parse(raw) as Partial<RandomFeedbackState>;
    return {
      recentKeys: Array.isArray(parsed.recentKeys) ? parsed.recentKeys.filter((value): value is string => typeof value === "string") : [],
      phraseBias: parsed.phraseBias && typeof parsed.phraseBias === "object" ? parsed.phraseBias : {},
      categoryBias: parsed.categoryBias && typeof parsed.categoryBias === "object" ? parsed.categoryBias : {},
      typeBias: parsed.typeBias && typeof parsed.typeBias === "object" ? parsed.typeBias : {},
      difficultyBias: parsed.difficultyBias && typeof parsed.difficultyBias === "object" ? parsed.difficultyBias : {},
      skipReasons: parsed.skipReasons && typeof parsed.skipReasons === "object" ? parsed.skipReasons : {},
    };
  } catch {
    return {
      recentKeys: [],
      phraseBias: {},
      categoryBias: {},
      typeBias: {},
      difficultyBias: {},
      skipReasons: {},
    };
  }
}

function pushRecentKey(recentKeys: string[], key: string) {
  return [key, ...recentKeys.filter((item) => item !== key)].slice(0, RECENT_HISTORY_LIMIT);
}

function adjustBias(record: Record<string, number>, key: string, amount: number) {
  if (!key) return record;
  const nextValue = (record[key] || 0) + amount;
  if (Math.abs(nextValue) < 0.1) {
    const { [key]: _removed, ...rest } = record;
    return rest;
  }
  return { ...record, [key]: nextValue };
}

function buildSkipFeedback(previous: RandomFeedbackState, entry: DiscoveryEntry, reason: SkipReason): RandomFeedbackState {
  const key = normalizePhrase(entry.phraseText);
  const exactPenalty = reason === "not_useful" ? -8 : reason === "already_know_it" ? -5 : -4;
  const categoryPenalty = reason === "not_useful" ? -4 : -2;
  const typePenalty = reason === "not_useful" ? -3 : -1.5;
  const difficultyPenalty = reason === "too_easy" ? -4 : -1;

  return {
    recentKeys: pushRecentKey(previous.recentKeys, key),
    phraseBias: adjustBias(previous.phraseBias, key, exactPenalty),
    categoryBias: adjustBias(previous.categoryBias, entry.category, categoryPenalty),
    typeBias: adjustBias(previous.typeBias, entry.phraseType, typePenalty),
    difficultyBias: adjustBias(previous.difficultyBias, entry.difficultyLevel, difficultyPenalty),
    skipReasons: { ...previous.skipReasons, [key]: reason },
  };
}

function buildPositiveFeedback(previous: RandomFeedbackState, entry: DiscoveryEntry, strength = 1.5): RandomFeedbackState {
  const key = normalizePhrase(entry.phraseText);
  const { [key]: _removedSkipReason, ...remainingReasons } = previous.skipReasons;

  return {
    recentKeys: previous.recentKeys.filter((item) => item !== key),
    phraseBias: adjustBias(previous.phraseBias, key, strength * 2),
    categoryBias: adjustBias(previous.categoryBias, entry.category, strength),
    typeBias: adjustBias(previous.typeBias, entry.phraseType, strength * 0.8),
    difficultyBias: adjustBias(previous.difficultyBias, entry.difficultyLevel, strength * 0.6),
    skipReasons: remainingReasons,
  };
}

function scoreEntry(entry: DiscoveryEntry, feedback: RandomFeedbackState) {
  const key = normalizePhrase(entry.phraseText);
  const recentIndex = feedback.recentKeys.indexOf(key);
  const recentPenalty = recentIndex === -1 ? 0 : Math.max(7 - recentIndex * 0.45, 1.4);
  const sourceBonus = entry.entrySource === "imported" ? 1.8 : entry.entrySource === "ai" ? 0.6 : 0;
  const commonBonus = entry.phraseType === "word" && entry.isCommon !== false ? 0.8 : 0;
  return (
    (feedback.phraseBias[key] || 0) +
    (feedback.categoryBias[entry.category] || 0) +
    (feedback.typeBias[entry.phraseType] || 0) +
    (feedback.difficultyBias[entry.difficultyLevel] || 0) +
    sourceBonus +
    commonBonus -
    recentPenalty +
    Math.random() * 1.25
  );
}

function pickEntry(entries: DiscoveryEntry[], feedback: RandomFeedbackState, excludeKeys: Set<string> = new Set()) {
  const eligible = entries.filter((entry) => !excludeKeys.has(normalizePhrase(entry.phraseText)));
  if (eligible.length === 0) return null;

  return [...eligible]
    .sort((a, b) => scoreEntry(b, feedback) - scoreEntry(a, feedback))
    .slice(0, Math.min(6, eligible.length))[Math.floor(Math.random() * Math.min(3, eligible.length))];
}

function tokenize(text: string) {
  return (text.toLowerCase().match(TOKEN_PATTERN) || []).filter(Boolean);
}

function calculateTextSimilarity(current: DiscoveryEntry, candidate: DiscoveryEntry) {
  const currentTokens = new Set(tokenize(current.phraseText));
  const candidateTokens = tokenize(candidate.phraseText);
  const sharedTokens = candidateTokens.filter((token) => currentTokens.has(token)).length;
  const sameCategory = current.category === candidate.category ? 2 : 0;
  const sameType = current.phraseType === candidate.phraseType ? 1.5 : 0;
  const sameStart = current.phraseText[0]?.toLowerCase() === candidate.phraseText[0]?.toLowerCase() ? 1 : 0;
  const lengthDistance = Math.abs(current.phraseText.length - candidate.phraseText.length) <= 3 ? 1 : 0;
  return sharedTokens * 4 + sameCategory + sameType + sameStart + lengthDistance;
}

function buildLearningDepth(current: DiscoveryEntry | null, entries: DiscoveryEntry[], preview: AIGenerationResult | null) {
  if (!current) {
    return { related: [] as string[], confusable: [] as string[] };
  }

  const currentKey = normalizePhrase(current.phraseText);
  const previewRelated = Array.isArray(preview?.relatedPhrases) ? preview.relatedPhrases : current.relatedPhrases || [];
  const localCandidates = entries
    .filter((entry) => normalizePhrase(entry.phraseText) !== currentKey)
    .map((entry) => ({ entry, score: calculateTextSimilarity(current, entry) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.entry.phraseText);

  const related = Array.from(new Set([...previewRelated, ...localCandidates])).filter(Boolean).slice(0, 5);
  const confusable = localCandidates
    .filter((text) => !related.includes(text))
    .filter((text) => {
      const currentTokens = tokenize(current.phraseText);
      const candidateTokens = tokenize(text);
      const sameLeadingToken = currentTokens[0] && candidateTokens[0] && currentTokens[0] === candidateTokens[0];
      const sameLength = Math.abs(text.length - current.phraseText.length) <= 4;
      return sameLeadingToken || (current.phraseType === "word" && sameLength);
    })
    .slice(0, 4);

  return { related, confusable };
}

function renderLookupText(text: string) {
  return <span className="whitespace-pre-wrap">{text}</span>;
}

function buildFallbackExplanation(entry: DiscoveryEntry): AIGenerationResult {
  const exampleText =
    entry.sourceExample ||
    (entry.phraseType === "word"
      ? `I heard "${entry.phraseText}" in a sentence and want to remember it.`
      : `I want to remember how to use "${entry.phraseText}" naturally.`);

  return {
    phraseType: entry.phraseType,
    standardMeaning: entry.sourceMeaning || `${entry.phraseText} is a useful ${entry.phraseType.replace("_", " ")} to remember.`,
    easyMeaning: entry.sourceMeaning || `Simple meaning for "${entry.phraseText}" is not available yet, but it was saved for review.`,
    aiExplanation: entry.sourceMeaning || `This entry was saved without a live AI explanation so you can come back to it later.`,
    usageContext: entry.sourceExample || `Save it now and review the meaning later when you study this category again.`,
    examples: [
      {
        type: "simple",
        text: exampleText,
      },
    ],
    somaliMeaning: entry.sourceMeaning || "Macnaha wali lama samayn.",
    partOfSpeech: entry.phraseType === "word" ? "word" : "phrase",
    somaliExplanation: "Sharaxaad buuxda wali lama samayn, laakiin erayga waa la keydiyay.",
    somaliSentence: entry.sourceExample || `Waxaan rabaa inaan barto "${entry.phraseText}".`,
    somaliSentenceTranslation: entry.sourceExample || exampleText,
    usageNote: "",
    contextNote: "",
    commonMistake: "No common mistake saved yet.",
    pronunciationText: `/${entry.phraseText}/`,
    relatedPhrases: Array.isArray(entry.relatedPhrases) ? entry.relatedPhrases.slice(0, 5) : [],
    aiProvider: "fallback",
    aiProviderLabel: "Local fallback",
    aiModel: "none",
  };
}

export default function RandomPhrasesPage() {
  const { phrases, addPhrase } = usePhraseStore();
  const { toast } = useToast();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const swipeStartX = useRef<number | null>(null);

  const [feedback, setFeedback] = useState<RandomFeedbackState>(() => loadFeedbackState());
  const [currentPhrase, setCurrentPhrase] = useState<DiscoveryEntry | null>(null);
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
  const [importedPhrases, setImportedPhrases] = useState<DiscoveryEntry[]>([]);
  const [importedSourceLabel, setImportedSourceLabel] = useState("No imported deck loaded");
  const [bankLoading, setBankLoading] = useState(true);
  const [aiEntries, setAiEntries] = useState<DiscoveryEntry[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [surpriseModeEnabled, setSurpriseModeEnabled] = useState(false);
  const [browseMode, setBrowseMode] = useState<BrowseMode>("vocabulary");
  const [onlyCommonWords, setOnlyCommonWords] = useState(true);
  const [includeImportedEntries, setIncludeImportedEntries] = useState(true);
  const [difficultyFilter, setDifficultyFilter] = useState<"all" | DifficultyLevel>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | PhraseType>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [audioAssets, setAudioAssets] = useState<Record<string, PhraseAudioAsset>>({});
  const [isDesktopLayout, setIsDesktopLayout] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 1024
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktopLayout(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(feedback));
  }, [feedback]);

  useEffect(() => {
    let active = true;

    async function loadBank() {
      setBankLoading(true);
      try {
        const data = await loadImportedPhraseBank();
        if (!active) return;
        setImportedPhrases(
          data.entries.map((entry) => ({
            ...entry,
            entrySource: "imported",
            sourceLabel: data.sourceLabel,
          }))
        );
        setImportedSourceLabel(`${data.sourceLabel} · ${data.totalEntries.toLocaleString()} cards`);
      } catch (error) {
        if (!active) return;
        setImportedPhrases([]);
        setImportedSourceLabel("Imported deck unavailable");
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

    void loadBank();

    return () => {
      active = false;
    };
  }, [toast]);

  const savedPhrases = useMemo(
    () => new Set(phrases.map((phrase) => normalizePhrase(phrase.phraseText))),
    [phrases]
  );

  const builtInEntries = useMemo<DiscoveryEntry[]>(
    () =>
      phraseBank.map((entry) => ({
        ...entry,
        entrySource: "built_in",
        sourceLabel: "Core phrase bank",
      })),
    []
  );

  const fullPhraseBank = useMemo(() => {
    const seen = new Set<string>();
    const merged = [
      ...(includeImportedEntries ? importedPhrases : []),
      ...aiEntries,
      ...builtInEntries,
    ];

    return merged.filter((entry) => {
      const key = normalizePhrase(entry.phraseText);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [aiEntries, builtInEntries, importedPhrases, includeImportedEntries]);

  const availableCategories = useMemo(
    () => [...new Set(fullPhraseBank.map((entry) => entry.category))].sort(),
    [fullPhraseBank]
  );

  const filteredEntries = useMemo(() => {
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
  }, [browseMode, categoryFilter, difficultyFilter, fullPhraseBank, onlyCommonWords, savedPhrases, typeFilter]);

  const poolStats = useMemo(() => {
    const activeImportedEntries = includeImportedEntries ? importedPhrases : [];
    const hiddenSavedCount = fullPhraseBank.filter((entry) => savedPhrases.has(normalizePhrase(entry.phraseText))).length;

    return {
      builtIn: builtInEntries.length,
      imported: activeImportedEntries.length,
      ai: aiEntries.length,
      uniquePool: fullPhraseBank.length,
      hiddenSavedCount,
      availableNow: filteredEntries.length,
    };
  }, [aiEntries.length, builtInEntries, filteredEntries.length, fullPhraseBank, importedPhrases, includeImportedEntries, savedPhrases]);

  const learningDepth = useMemo(
    () => buildLearningDepth(currentPhrase, fullPhraseBank, preview),
    [currentPhrase, fullPhraseBank, preview]
  );

  const updateFeedback = (updater: (previous: RandomFeedbackState) => RandomFeedbackState) => {
    setFeedback((previous) => updater(previous));
  };

  const applyPositiveInterest = (entry: DiscoveryEntry, strength = 1.5) => {
    updateFeedback((previous) => buildPositiveFeedback(previous, entry, strength));
  };

  const chooseNextEntry = async (reason?: SkipReason) => {
    const current = currentPhrase;
    const nextFeedback = current && reason ? buildSkipFeedback(feedback, current, reason) : feedback;

    if (current && reason) {
      setFeedback(nextFeedback);
    }

    const excludeKeys = new Set<string>();
    if (current) {
      excludeKeys.add(normalizePhrase(current.phraseText));
    }

    let next = pickEntry(filteredEntries, nextFeedback, excludeKeys);

    if (!next && surpriseModeEnabled) {
      const surprises = await fetchAiSurprises();
      const surprisePool = [...filteredEntries, ...surprises];
      next = pickEntry(surprisePool, nextFeedback, excludeKeys);
    }

    if (!next && current) {
      toast({
        title: "No better card available yet",
        description: "Broaden filters or enable AI surprise mode to keep moving.",
      });
      return;
    }

    setCurrentPhrase(next);
    setPreview(null);
  };

  useEffect(() => {
    if (filteredEntries.length === 0) {
      setCurrentPhrase(null);
      setPreview(null);
      return;
    }

    const currentKey = currentPhrase ? normalizePhrase(currentPhrase.phraseText) : "";
    const stillVisible = currentPhrase
      ? filteredEntries.some((entry) => normalizePhrase(entry.phraseText) === currentKey)
      : false;

    if (!stillVisible) {
      setCurrentPhrase(pickEntry(filteredEntries, feedback));
      setPreview(null);
    }
  }, [currentPhrase, feedback, filteredEntries]);

  useEffect(() => {
    if (!currentPhrase?.phraseText) return;
    const key = normalizePhrase(currentPhrase.phraseText);
    const existing = audioAssets[key];
    const existingUrl = getPlayableAudioUrl(existing);
    if (existingUrl) {
      primeAudioUrl(existingUrl);
      return;
    }

    let cancelled = false;
    void ensureRuntimeTtsAsset({
      key,
      text: currentPhrase.phraseText,
      language: "en-US",
    }).then((asset) => {
      if (cancelled || !asset) return;
      const playableUrl = getPlayableAudioUrl(asset);
      if (!playableUrl) return;
      setAudioAssets((current) => ({ ...current, [key]: { ...asset, text: currentPhrase.phraseText } }));
      primeAudioUrl(playableUrl);
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [audioAssets, currentPhrase?.phraseText]);

  const playPhraseAudio = (text: string) => {
    const key = normalizePhrase(text);
    const existingAsset = audioAssets[key];
    const existingUrl = getPlayableAudioUrl(existingAsset);

    const playback = existingUrl
      ? Promise.resolve(existingUrl)
      : ensureRuntimeTtsAsset({ key, text, language: "en-US" }).then((asset) => {
          const playableUrl = getPlayableAudioUrl(asset);
          if (!asset || !playableUrl) return "";
          setAudioAssets((current) => ({ ...current, [key]: { ...asset, text } }));
          return playableUrl;
        });

    void playback
      .then((playableUrl) => {
        if (!playableUrl) {
          throw new Error("missing-audio");
        }
        return playRuntimeTtsAsset({ key, text, language: "en-US" }, audioAssets[key]);
      })
      .catch(() => {
        toast({
          title: "Could not play audio",
          description: "This audio file could not be played right now.",
          variant: "destructive",
        });
      });
  };

  const handlePreviewPhrase = async () => {
    if (!currentPhrase) return;

    setPreviewLoading(true);
    try {
      const googleTranslation = await translateText(currentPhrase.phraseText).catch(() => "");
      const result = await generateAIExplanation(currentPhrase.phraseText, undefined, false, googleTranslation);
      setPreview(result);
      applyPositiveInterest(currentPhrase, 0.9);
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
      await addPhrase(
        {
          phraseText: currentPhrase.phraseText,
          phraseType: currentPhrase.phraseType,
          category: currentPhrase.category,
          difficultyLevel: currentPhrase.difficultyLevel,
          notes: `Saved from ${currentPhrase.sourceLabel}`,
        },
        preview ?? buildFallbackExplanation(currentPhrase)
      );

      applyPositiveInterest(currentPhrase, 2.1);
      toast({
        title: "Phrase added",
        description: `"${currentPhrase.phraseText}" was saved to your library.`,
      });

      const currentKey = normalizePhrase(currentPhrase.phraseText);
      const remaining = filteredEntries.filter((entry) => normalizePhrase(entry.phraseText) !== currentKey);
      const next = pickEntry(remaining, buildPositiveFeedback(feedback, currentPhrase, 2.1), new Set([currentKey]));
      setCurrentPhrase(next);
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
      const googleTranslation = await translateText(cleanWord).catch(() => "");
      const result = await generateAIExplanation(cleanWord, undefined, false, googleTranslation);
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

  const handleSaveSelectedWord = async () => {
    if (!selectedWord) return;

    setSelectedWordSaving(true);
    try {
      await addPhrase({
        phraseText: selectedWord,
        phraseType: "word",
        category: currentPhrase?.category || "Learning",
        difficultyLevel: inferWordDifficulty(selectedWord),
        notes: "Saved from Random Learning selection",
      }, buildFallbackExplanation({
        phraseText: selectedWord,
        phraseType: "word",
        category: currentPhrase?.category || "Learning",
        difficultyLevel: inferWordDifficulty(selectedWord),
        entrySource: "ai",
        sourceLabel: "Quick save",
      }));

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
      await addPhrase(
        {
          phraseText: lookupWord,
          phraseType: "word",
          category: currentPhrase?.category || "Learning",
          difficultyLevel: inferWordDifficulty(lookupWord),
          notes: "Saved from Random Learning lookup",
        },
        {
          ...lookupPreview,
          phraseType: "word",
        }
      );

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

  const jumpToSuggestion = (text: string) => {
    const match = filteredEntries.find((entry) => normalizePhrase(entry.phraseText) === normalizePhrase(text));
    if (match) {
      setCurrentPhrase(match);
      setPreview(null);
      return;
    }

    void handleLookupWord(text);
  };

  const fetchAiSurprises = async () => {
    setAiLoading(true);
    try {
      const excludePhrases = Array.from(
        new Set([
          ...phrases.map((phrase) => phrase.phraseText),
          ...fullPhraseBank.map((entry) => entry.phraseText),
        ])
      );

      const generated = await generateRandomPhraseEntries({
        count: 18,
        difficulty: difficultyFilter,
        phraseType: browseMode === "vocabulary" ? "word" : typeFilter,
        category: categoryFilter,
        excludePhrases,
      });

      const nextEntries: DiscoveryEntry[] = generated.map((entry) => ({
        ...entry,
        entrySource: "ai",
        sourceLabel: "AI surprise",
      }));

      let mergedEntries: DiscoveryEntry[] = [];
      setAiEntries((current) => {
        const seen = new Set(current.map((entry) => normalizePhrase(entry.phraseText)));
        const merged = [...current];
        for (const entry of nextEntries) {
          const key = normalizePhrase(entry.phraseText);
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(entry);
        }
        mergedEntries = merged;
        return merged;
      });
      setSurpriseModeEnabled(true);
      toast({
        title: "Surprise mode ready",
        description: "Fresh AI suggestions were added to your discovery queue.",
      });
      return mergedEntries.length ? mergedEntries : nextEntries;
    } catch (error) {
      toast({
        title: "Could not generate surprise phrases",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      return [];
    } finally {
      setAiLoading(false);
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
  }, [currentPhrase]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (!isDesktopLayout) return;

      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (isTyping || lookupWord) return;

      if (event.key === " " && currentPhrase) {
        event.preventDefault();
        if (!previewLoading && !loading) {
          void handlePreviewPhrase();
        }
      }
      if (event.key.toLowerCase() === "s" && currentPhrase && !loading) {
        event.preventDefault();
        void handleSavePhrase();
      }
      if (event.key.toLowerCase() === "n" && currentPhrase && !loading) {
        event.preventDefault();
        void chooseNextEntry();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [currentPhrase, isDesktopLayout, loading, lookupWord, previewLoading]);

  const handleMobileTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    swipeStartX.current = event.touches[0]?.clientX ?? null;
  };

  const handleMobileTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (swipeStartX.current === null || showFilters || lookupWord || loading || !currentPhrase) {
      swipeStartX.current = null;
      return;
    }

    const diff = event.changedTouches[0].clientX - swipeStartX.current;
    swipeStartX.current = null;
    if (Math.abs(diff) < 65) return;

    if (diff > 0) {
      void handleSavePhrase();
    } else {
      chooseNextEntry();
    }
  };

  const lookupAlreadySaved = lookupWord ? savedPhrases.has(normalizePhrase(lookupWord)) : false;
  const selectedWordAlreadySaved = selectedWord ? savedPhrases.has(normalizePhrase(selectedWord)) : false;
  const noEntries = filteredEntries.length === 0;

  return (
    <>
      {isDesktopLayout ? (
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
                    <Switch id="common-words-toggle" checked={onlyCommonWords} onCheckedChange={setOnlyCommonWords} />
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
                  <Switch id="imported-entries-toggle" checked={includeImportedEntries} onCheckedChange={setIncludeImportedEntries} />
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

            <div className="grid gap-3 rounded-[1.4rem] border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">Available now</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{poolStats.availableNow.toLocaleString()}</p>
                <p className="mt-1 text-xs">After current filters and saved-word hiding.</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">Imported deck</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{poolStats.imported.toLocaleString()}</p>
                <p className="mt-1 text-xs">Currently included from imported decks.</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">Hidden as saved</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{poolStats.hiddenSavedCount.toLocaleString()}</p>
                <p className="mt-1 text-xs">Already saved in your library.</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">Pool makeup</p>
                <p className="mt-1 text-sm text-foreground">
                  {poolStats.uniquePool.toLocaleString()} unique
                </p>
                <p className="mt-1 text-xs">
                  Built-in {poolStats.builtIn.toLocaleString()} · Imported {poolStats.imported.toLocaleString()} · AI {poolStats.ai.toLocaleString()}
                </p>
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
                  <Button onClick={() => void handleSavePhrase()} className="gap-2" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {loading ? "Saving..." : "Save"}
                  </Button>
                  <Button onClick={() => void chooseNextEntry()} variant="outline" className="gap-2" disabled={loading || noEntries}>
                    <RefreshCw className="h-4 w-4" />
                    Another Random Phrase
                  </Button>
                  {surpriseModeEnabled ? (
                    <Button onClick={() => void fetchAiSurprises()} variant="outline" className="gap-2" disabled={aiLoading}>
                      {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stars className="h-4 w-4" />}
                      Refresh AI Picks
                    </Button>
                  ) : null}
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {(Object.keys(SKIP_REASON_COPY) as SkipReason[]).map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => void chooseNextEntry(reason)}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                    >
                      {SKIP_REASON_COPY[reason]}
                    </button>
                  ))}
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
          </div>
        </div>
      ) : null}

      {!isDesktopLayout ? (
      <div
        className="fixed inset-x-0 top-16 bottom-0 flex flex-col bg-background lg:hidden"
        onTouchStart={handleMobileTouchStart}
        onTouchEnd={handleMobileTouchEnd}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Explore</p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">Random Learning</h1>
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(true)}
            className="rounded-2xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm"
          >
            Filters
          </button>
        </div>

        {showFilters ? (
          <>
            <div className="fixed inset-0 z-20 bg-black/40" onClick={() => setShowFilters(false)} />
            <div className="fixed inset-x-0 bottom-0 z-30 rounded-t-3xl bg-card px-6 pb-10 pt-5 animate-in slide-in-from-bottom-4 duration-300">
              <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted-foreground/20" />
              <div className="mb-5 flex items-center justify-between">
                <p className="text-base font-semibold text-foreground">Filters</p>
                <button type="button" onClick={() => setShowFilters(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-5">
                <div>
                  <p className="mb-2.5 text-xs font-medium text-muted-foreground">Mode</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["vocabulary", "phrases"] as BrowseMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setBrowseMode(mode);
                          setPreview(null);
                          if (mode === "vocabulary") setTypeFilter("all");
                        }}
                        className={`rounded-2xl border py-2.5 text-sm font-medium capitalize transition-colors ${
                          browseMode === mode ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2.5 text-xs font-medium text-muted-foreground">Difficulty</p>
                  <div className="flex flex-wrap gap-2">
                    {(["all", "beginner", "intermediate", "advanced"] as Array<"all" | DifficultyLevel>).map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setDifficultyFilter(level)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                          difficultyFilter === level ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                        }`}
                      >
                        {level === "all" ? "All Levels" : level}
                      </button>
                    ))}
                  </div>
                </div>
                {browseMode === "phrases" ? (
                  <div>
                    <p className="mb-2.5 text-xs font-medium text-muted-foreground">Type</p>
                    <div className="flex flex-wrap gap-2">
                      {(["all", "phrase", "phrasal_verb", "idiom", "expression"] as Array<"all" | PhraseType>).map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setTypeFilter(item)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            typeFilter === item ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                          }`}
                        >
                          {item === "all" ? "All Types" : item.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div>
                  <p className="mb-2.5 text-xs font-medium text-muted-foreground">Category</p>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {availableCategories.map((category) => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
                  <span className="text-sm text-foreground">Imported decks</span>
                  <Switch checked={includeImportedEntries} onCheckedChange={setIncludeImportedEntries} />
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
                  <span className="text-sm text-foreground">Keep AI surprises ready</span>
                  <Switch checked={surpriseModeEnabled} onCheckedChange={setSurpriseModeEnabled} />
                </div>
                {browseMode === "vocabulary" ? (
                  <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
                    <span className="text-sm text-foreground">Common words only</span>
                    <Switch checked={onlyCommonWords} onCheckedChange={setOnlyCommonWords} />
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : null}

        <div className="flex-1 overflow-y-auto pb-4">
          <div className="px-5 pt-4">
            <div className="rounded-3xl border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Deck</p>
              <p className="mt-2 text-sm text-foreground">{bankLoading ? "Loading imported deck..." : importedSourceLabel}</p>
              <p className="mt-2 text-xs text-muted-foreground">Swipe right to save. Swipe left to skip.</p>
            </div>
          </div>

          <div className="px-5 pt-4">
            <div className="rounded-3xl border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Available now</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{poolStats.availableNow.toLocaleString()}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Built-in {poolStats.builtIn.toLocaleString()} · Imported {poolStats.imported.toLocaleString()} · Hidden saved {poolStats.hiddenSavedCount.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Unique pool {poolStats.uniquePool.toLocaleString()} · AI picks {poolStats.ai.toLocaleString()}
              </p>
            </div>
          </div>

          {noEntries ? (
            <div className="px-5 pt-8 text-center">
              <WandSparkles className="mx-auto h-10 w-10 text-primary" />
              <p className="mt-4 text-lg font-semibold text-foreground">Nothing left in this slice</p>
              <p className="mt-2 text-sm text-muted-foreground">Pull in new AI cards and keep the session moving.</p>
              <Button onClick={() => void fetchAiSurprises()} disabled={aiLoading} className="mt-5 gap-2">
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stars className="h-4 w-4" />}
                Surprise me with AI
              </Button>
            </div>
          ) : currentPhrase ? (
            <>
              <div className="mx-auto flex w-full max-w-sm flex-col px-6 pb-8 pt-8">
                <p className="text-center text-[11px] font-medium tracking-wide text-muted-foreground/70">
                  {currentPhrase.phraseType.replace("_", " ")} · {currentPhrase.category} · {currentPhrase.difficultyLevel}
                </p>
                <p className="mt-3 text-center text-xs font-medium uppercase tracking-[0.18em] text-primary/80">{currentPhrase.sourceLabel}</p>
                <h2 className="mt-4 text-center text-[clamp(2.7rem,15vw,4.4rem)] font-bold leading-[0.92] tracking-[-0.05em] text-foreground">
                  {currentPhrase.phraseText}
                </h2>
                {currentPhrase.sourceMeaning ? (
                  <p className="mx-auto mt-4 max-w-[18rem] text-center text-sm leading-relaxed text-muted-foreground">
                    {renderLookupText(currentPhrase.sourceMeaning)}
                  </p>
                ) : null}

                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={handlePreviewPhrase} disabled={previewLoading}>
                    {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                    Preview
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => playPhraseAudio(currentPhrase.phraseText)}>
                    <Volume2 className="h-4 w-4" />
                    Hear
                  </Button>
                </div>

                {currentPhrase.sourceImages?.[0] ? (
                  <div className="mt-6 overflow-hidden rounded-[1.75rem] border bg-muted/20">
                    <img src={currentPhrase.sourceImages[0]} alt={currentPhrase.phraseText} className="h-48 w-full object-cover" />
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {(Object.keys(SKIP_REASON_COPY) as SkipReason[]).map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => void chooseNextEntry(reason)}
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
                    >
                      {SKIP_REASON_COPY[reason]}
                    </button>
                  ))}
                </div>

                <div className="mt-6 rounded-3xl border bg-card/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Related</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {learningDepth.related.slice(0, 4).length > 0 ? (
                      learningDepth.related.slice(0, 4).map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => jumpToSuggestion(item)}
                          className="rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-foreground"
                        >
                          {item}
                        </button>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">Preview the phrase to unlock related hints.</span>
                    )}
                  </div>
                </div>

                {preview ? (
                  <div ref={previewRef} className="mt-6 flex flex-col gap-6">
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">Easy meaning</p>
                      <p className="text-[1.02rem] leading-8 text-foreground/92">{renderLookupText(preview.easyMeaning)}</p>
                    </div>
                    <div className="border-t border-border/50" />
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">Standard meaning</p>
                      <p className="text-[1.02rem] leading-8 text-foreground/92">{renderLookupText(preview.standardMeaning)}</p>
                    </div>
                    <div className="border-t border-border/50" />
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">AI explanation</p>
                      <p className="text-[1.02rem] leading-8 text-foreground/92">{renderLookupText(preview.aiExplanation)}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        {!noEntries && currentPhrase ? (
          <div className="shrink-0 border-t border-border/60 bg-background px-4 pb-1 pt-1">
            <div className="mx-auto flex w-full max-w-sm items-center gap-3">
              <Button onClick={() => void chooseNextEntry()} variant="outline" className="h-11 flex-1 rounded-2xl">
                <RefreshCw className="mr-2 h-4 w-4" />
                Skip
              </Button>
              <Button onClick={() => void handleSavePhrase()} className="h-11 flex-1 rounded-2xl" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      ) : null}

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
        <div className="fixed inset-x-4 bottom-20 z-40 flex justify-center sm:hidden">
          <div className="flex w-full max-w-md items-center justify-between gap-2 rounded-2xl border bg-background/95 p-2 shadow-lg backdrop-blur">
            <p className="truncate px-2 text-sm text-foreground">
              <span className="font-medium">Selected:</span> {selectedWord}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => void handleLookupWord(selectedWord)}>
                Learn
              </Button>
              <Button size="sm" onClick={() => void handleSaveSelectedWord()} disabled={selectedWordSaving || selectedWordAlreadySaved}>
                {selectedWordAlreadySaved ? "Saved" : selectedWordSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog
        open={Boolean(lookupWord)}
        onOpenChange={(open) => {
          if (!open) {
            setLookupWord(null);
            setLookupPreview(null);
          }
        }}
      >
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
            <Button
              variant="outline"
              onClick={() => {
                setLookupWord(null);
                setLookupPreview(null);
              }}
            >
              Close
            </Button>
            <Button onClick={() => void handleSaveLookupWord()} disabled={!lookupPreview || !lookupWord || lookupSaving || lookupAlreadySaved}>
              {lookupAlreadySaved ? "Already Saved" : lookupSaving ? "Saving..." : "Save Word"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
