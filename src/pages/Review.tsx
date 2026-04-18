import { useEffect, useMemo, useState } from "react";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RotateCcw, Eye, BookOpen, Keyboard, Volume2, CheckCircle2, Trophy, Loader2, Sparkles } from "lucide-react";
import { ReviewRating, Phrase, AIGenerationResult } from "@/types";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { getReviewStage, getReviewTimingPreview } from "@/lib/review";
import { speakText } from "@/lib/tts";
import { generateAIExplanation, getAiProviderLabel, getSavedWordRegenerationProvider, SAVED_WORD_REGENERATION_OPTIONS } from "@/lib/ai";
import { translateText } from "@/lib/googleTranslate";
import { useToast } from "@/hooks/use-toast";

type ReviewMode = "phrase_to_meaning" | "meaning_to_phrase" | "somali_to_english";

const modeLabels: Record<ReviewMode, string> = {
  phrase_to_meaning: "Phrase → Meaning",
  meaning_to_phrase: "Meaning → Phrase",
  somali_to_english: "Somali → English",
};

const ratingConfig: {
  rating: ReviewRating;
  label: string;
  shortcut: string;
  buttonClassName: string;
}[] = [
  {
    rating: "again",
    label: "Again",
    shortcut: "1",
    buttonClassName: "border-destructive text-destructive hover:bg-destructive/10",
  },
  {
    rating: "hard",
    label: "Hard",
    shortcut: "2",
    buttonClassName: "border-orange-400 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300",
  },
  {
    rating: "good",
    label: "Good",
    shortcut: "3",
    buttonClassName: "border-primary text-primary hover:bg-primary/10",
  },
  {
    rating: "easy",
    label: "Easy",
    shortcut: "4",
    buttonClassName: "border-success text-success hover:bg-success/10",
  },
];

function getPromptLabel(mode: ReviewMode) {
  if (mode === "phrase_to_meaning") return "Prompt";
  if (mode === "meaning_to_phrase") return "Meaning";
  return "Somali";
}

function getQuestion(phrase: Phrase, mode: ReviewMode) {
  switch (mode) {
    case "phrase_to_meaning":
      return phrase.phraseText;
    case "meaning_to_phrase":
      return phrase.explanation?.easyMeaning || "...";
    case "somali_to_english":
      return phrase.explanation?.somaliMeaning || "...";
  }
}

function getAnswer(phrase: Phrase, mode: ReviewMode) {
  switch (mode) {
    case "phrase_to_meaning":
      return phrase.explanation?.easyMeaning || phrase.explanation?.standardMeaning || "...";
    case "meaning_to_phrase":
      return phrase.phraseText;
    case "somali_to_english":
      return phrase.phraseText;
  }
}

export default function ReviewPage() {
  const { phrases, getDueForReview, reviewPhrase, updatePhrase } = usePhraseStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const dueForReview = getDueForReview();

  const [mode, setMode] = useState<ReviewMode>("phrase_to_meaning");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [practiceAll, setPracticeAll] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [sessionStats, setSessionStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [googleTranslation, setGoogleTranslation] = useState("");
  const [reExplainProvider, setReExplainProvider] = useState<"deepseek" | "gemini">("deepseek");
  const [isReExplaining, setIsReExplaining] = useState(false);

  const reviewList = useMemo(() => {
    if (practiceAll) return phrases;
    return dueForReview;
  }, [dueForReview, phrases, practiceAll]);

  const currentPhrase = reviewList[currentIndex];
  const timingPreview = useMemo(
    () => getReviewTimingPreview(currentPhrase?.review),
    [currentPhrase]
  );
  const reviewStage = useMemo(
    () => getReviewStage(currentPhrase?.review),
    [currentPhrase]
  );
  const recommendedReExplainProvider = useMemo(
    () => getSavedWordRegenerationProvider(currentPhrase),
    [currentPhrase]
  );

  useEffect(() => {
    setReExplainProvider(recommendedReExplainProvider);
  }, [recommendedReExplainProvider]);

  function speakCurrentPrompt() {
    if (!currentPhrase) return;
    speakText(currentPhrase.phraseText);
  }

  const buildExplanation = (phrase: Phrase, result: AIGenerationResult) => ({
    id: phrase.explanation?.id ?? crypto.randomUUID(),
    phraseId: phrase.id,
    standardMeaning: result.standardMeaning,
    easyMeaning: result.easyMeaning,
    aiExplanation: result.aiExplanation,
    usageContext: result.usageContext,
    somaliMeaning: result.somaliMeaning,
    partOfSpeech: result.partOfSpeech,
    somaliExplanation: result.somaliExplanation,
    somaliSentence: result.somaliSentence,
    somaliSentenceTranslation: result.somaliSentenceTranslation,
    usageNote: result.usageNote,
    contextNote: result.contextNote,
    commonMistake: result.commonMistake,
    pronunciationText: result.pronunciationText,
    relatedPhrases: result.relatedPhrases,
    googleTranslation: phrase.explanation?.googleTranslation,
    googleTranslationUpdatedAt: phrase.explanation?.googleTranslationUpdatedAt,
    aiProvider: result.aiProvider,
    aiProviderLabel: result.aiProviderLabel,
    aiModel: result.aiModel,
  });

  const handleReExplainCurrent = async () => {
    if (!currentPhrase) return;
    setIsReExplaining(true);
    try {
      const result = await generateAIExplanation(currentPhrase.phraseText, reExplainProvider, true);
      updatePhrase(currentPhrase.id, {
        explanation: buildExplanation(currentPhrase, result),
        examples: result.examples?.map((example) => ({
          id: crypto.randomUUID(),
          phraseId: currentPhrase.id,
          exampleType: example.type,
          exampleText: example.text,
          translationText: example.translation,
        })) ?? [],
      });
      toast({ title: "Explanation updated", description: `Used ${getAiProviderLabel(result.aiProvider, result.aiProviderLabel)}.` });
    } catch (error) {
      toast({
        title: "Could not re-explain",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsReExplaining(false);
    }
  };

  const goToNextCard = () => {
    setRevealed(false);
    setCurrentIndex((index) => index + 1);
  };

  const handleRate = (rating: ReviewRating) => {
    if (!currentPhrase) return;
    reviewPhrase(currentPhrase.id, rating);
    setSessionStats((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
    setCompleted((count) => count + 1);

    if (currentIndex >= reviewList.length - 1) {
      setSessionDone(true);
    } else {
      goToNextCard();
    }
  };

  const startPracticeAll = () => {
    setPracticeAll(true);
    setCurrentIndex(0);
    setCompleted(0);
    setSessionDone(false);
    setSessionStats({ again: 0, hard: 0, good: 0, easy: 0 });
    setRevealed(false);
  };

  const restartSession = () => {
    setCurrentIndex(0);
    setCompleted(0);
    setSessionDone(false);
    setSessionStats({ again: 0, hard: 0, good: 0, easy: 0 });
    setRevealed(false);
  };

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const activeTag = (event.target as HTMLElement | null)?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;
      if (!currentPhrase || sessionDone) return;

      if (event.code === "Space") {
        event.preventDefault();
        if (!revealed) setRevealed(true);
        return;
      }

      if (!revealed) return;

      if (event.key === "1") { event.preventDefault(); handleRate("again"); }
      else if (event.key === "2") { event.preventDefault(); handleRate("hard"); }
      else if (event.key === "3") { event.preventDefault(); handleRate("good"); }
      else if (event.key === "4") { event.preventDefault(); handleRate("easy"); }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPhrase, revealed, sessionDone]);

  useEffect(() => {
    if (!currentPhrase || !user?.autoPlayAudioEnabled) return;
    speakCurrentPrompt();
  }, [currentPhrase?.id, mode, user?.autoPlayAudioEnabled]);

  useEffect(() => {
    if (!currentPhrase) return;
    const savedGoogleTranslation = currentPhrase.explanation?.googleTranslation?.trim() || "";
    if (savedGoogleTranslation) {
      setGoogleTranslation(savedGoogleTranslation);
      return;
    }

    setGoogleTranslation("");
    translateText(currentPhrase.phraseText)
      .then((translation) => {
        setGoogleTranslation(translation);
        if (translation && currentPhrase.explanation) {
          updatePhrase(currentPhrase.id, {
            explanation: {
              ...currentPhrase.explanation,
              googleTranslation: translation,
              googleTranslationUpdatedAt: new Date().toISOString(),
            },
          });
        }
      })
      .catch(() => {});
  }, [currentPhrase?.id]);

  // No phrases at all
  if (phrases.length === 0) {
    return (
      <div className="app-page py-16 text-center">
        <RotateCcw className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold text-foreground">No phrases to review</h2>
        <p className="mt-2 text-muted-foreground">Add some phrases first, then come back to review.</p>
        <Link to="/add-phrase"><Button className="mt-4">Add a Phrase</Button></Link>
      </div>
    );
  }

  // Session complete
  if (sessionDone) {
    const total = sessionStats.again + sessionStats.hard + sessionStats.good + sessionStats.easy;
    const knewIt = sessionStats.good + sessionStats.easy;
    return (
      <div className="app-page flex items-center justify-center py-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mx-auto w-full max-w-sm space-y-6 text-center"
        >
          <Trophy className="mx-auto h-14 w-14 text-yellow-500" />
          <div>
            <h2 className="text-2xl font-bold text-foreground">Session Complete!</h2>
            <p className="mt-1 text-muted-foreground">
              You reviewed {total} {total === 1 ? "phrase" : "phrases"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-left">
            {[
              { label: "Again", value: sessionStats.again, color: "text-destructive" },
              { label: "Hard", value: sessionStats.hard, color: "text-orange-500" },
              { label: "Good", value: sessionStats.good, color: "text-primary" },
              { label: "Easy", value: sessionStats.easy, color: "text-success" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border bg-card p-4">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {total > 0 && (
            <p className="text-sm text-muted-foreground">
              You knew{" "}
              <span className="font-semibold text-foreground">
                {Math.round((knewIt / total) * 100)}%
              </span>{" "}
              of your cards
            </p>
          )}

          <div className="flex justify-center gap-3">
            <Button onClick={restartSession} variant="outline">
              Review Again
            </Button>
            <Link to="/dashboard">
              <Button>Done</Button>
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // Phrases exist but none are due — offer practice mode
  if (dueForReview.length === 0 && !practiceAll) {
    return (
      <div className="app-page py-16 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
        <h2 className="mt-4 text-xl font-semibold text-foreground">All caught up!</h2>
        <p className="mt-2 text-muted-foreground">
          No phrases are due right now. Come back later, or practice all {phrases.length} phrases now.
        </p>
        <Button className="mt-6" onClick={startPracticeAll}>
          Practice All {phrases.length} Phrases
        </Button>
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="page-stack mx-auto max-w-4xl pt-12">
        <div className="text-center">
          <p className="admin-kicker">Review</p>
          <h1 className="admin-page-title">Review Flashcards</h1>
          <p className="admin-page-subtitle">
            {completed} reviewed · {reviewList.length - currentIndex} remaining
            {practiceAll && (
              <span className="ml-2 text-xs opacity-60">(practice mode)</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid w-full gap-3 sm:grid-cols-3">
            {(Object.keys(modeLabels) as ReviewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setRevealed(false);
                }}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-primary/90 text-primary-foreground shadow-sm"
                    : "bg-secondary/70 text-foreground hover:bg-secondary"
                }`}
              >
                {modeLabels[m]}
              </button>
            ))}
          </div>

        </div>

        {currentPhrase && (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPhrase.id + mode + currentIndex}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="admin-panel mx-auto w-full max-w-3xl p-8 text-center sm:p-10"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 text-left">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {getPromptLabel(mode)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Card {currentIndex + 1} of {reviewList.length}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={speakCurrentPrompt}
                    className="rounded-xl border bg-muted/20 p-2 text-foreground transition-colors hover:bg-muted"
                    aria-label="Play pronunciation"
                  >
                    <Volume2 className="h-4 w-4" />
                  </button>
                  <div className="rounded-xl border bg-muted/20 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Stage
                      </span>
                      <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
                        {reviewStage}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-8 text-3xl font-semibold text-foreground">
                {getQuestion(currentPhrase, mode)}
              </p>

              {!revealed ? (
                <div className="mt-8 space-y-4">
                  <Button
                    variant="outline"
                    onClick={() => setRevealed(true)}
                    className="h-11 gap-2 rounded-xl px-5"
                  >
                    <Eye className="h-4 w-4" /> Show Answer
                  </Button>
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Keyboard className="h-3.5 w-3.5" />
                    <span>Press Space to reveal</span>
                  </div>
                </div>
              ) : (
                <div className="mt-6 space-y-6">

                  <div className="rounded-[1.5rem] border bg-muted/25 p-5 text-left">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                      Answer
                    </p>
                    <p className="mt-2 text-xl font-semibold text-foreground">
                      {getAnswer(currentPhrase, mode)}
                    </p>

                    {currentPhrase.explanation?.standardMeaning && mode !== "phrase_to_meaning" && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {currentPhrase.explanation.standardMeaning}
                      </p>
                    )}

                    {(currentPhrase.explanation?.aiProvider || currentPhrase.explanation?.aiProviderLabel || currentPhrase.explanation?.aiModel) && (
                      <p className="mt-3 text-xs font-medium text-muted-foreground">
                        Answered by {getAiProviderLabel(currentPhrase.explanation.aiProvider, currentPhrase.explanation.aiProviderLabel)}
                        {currentPhrase.explanation.aiModel ? ` · ${currentPhrase.explanation.aiModel}` : ""}
                      </p>
                    )}

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {currentPhrase.explanation?.usageContext ? (
                        <div className="rounded-xl border border-border bg-card px-4 py-3">
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            When People Use This
                          </p>
                          <p className="mt-1 text-sm text-foreground">
                            {currentPhrase.explanation.usageContext}
                          </p>
                        </div>
                      ) : null}

                      {user?.somaliModeEnabled && googleTranslation ? (
                        <div className="rounded-xl border border-border bg-card px-4 py-3">
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            Google Translate
                          </p>
                          <p className="mt-1 text-sm text-foreground">
                            {googleTranslation}
                          </p>
                        </div>
                      ) : null}

                      {user?.somaliModeEnabled && currentPhrase.explanation?.somaliMeaning ? (
                        <div className="rounded-xl border border-border bg-card px-4 py-3">
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            AI Meaning
                          </p>
                          <p className="mt-1 text-sm text-foreground">
                            {currentPhrase.explanation.somaliMeaning}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {currentPhrase.examples && currentPhrase.examples.length > 0 ? (
                      <div className="mt-4 rounded-xl border border-border bg-card px-4 py-3">
                        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          <BookOpen className="h-3.5 w-3.5" />
                          Example
                        </p>
                        <p className="mt-1 text-sm text-foreground">
                          {currentPhrase.examples.find(
                            (example) => example.exampleType !== "somali"
                          )?.exampleText ?? currentPhrase.examples[0].exampleText}
                        </p>
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                      <span className="text-xs font-medium text-muted-foreground">Re-explain with</span>
                      <Select value={reExplainProvider} onValueChange={(value) => setReExplainProvider(value as "deepseek" | "gemini")}>
                        <SelectTrigger className="h-9 w-[190px] rounded-xl">
                          <SelectValue placeholder="Choose AI" />
                        </SelectTrigger>
                        <SelectContent>
                          {SAVED_WORD_REGENERATION_OPTIONS.map((provider) => (
                            <SelectItem key={provider.value} value={provider.value}>
                              {provider.label}{provider.value === recommendedReExplainProvider ? " (recommended)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleReExplainCurrent}
                        disabled={isReExplaining}
                        className="h-9 gap-2 rounded-xl"
                      >
                        {isReExplaining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {isReExplaining ? "Re-explaining..." : "Re-explain"}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-sm text-muted-foreground">
                      How well did you know this?
                    </p>
                    <div className="grid gap-3 sm:grid-cols-4">
                      {ratingConfig.map((item) => (
                        <button
                          key={item.rating}
                          type="button"
                          onClick={() => handleRate(item.rating)}
                          className={`rounded-2xl border border-border bg-card px-4 py-3 text-left transition-colors ${item.buttonClassName}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold">{item.label}</span>
                            <span className="text-xs font-medium opacity-70">{item.shortcut}</span>
                          </div>
                          <p className="mt-2 text-xs font-medium opacity-70">
                            {timingPreview[item.rating].label}
                          </p>
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Keyboard: `1` Again, `2` Hard, `3` Good, `4` Easy
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
