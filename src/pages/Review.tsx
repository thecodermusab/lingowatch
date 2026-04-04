import { useEffect, useMemo, useState } from "react";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { Button } from "@/components/ui/button";
import { RotateCcw, Eye, BookOpen, Keyboard, Volume2 } from "lucide-react";
import { ReviewRating, Phrase } from "@/types";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { getReviewStage, getReviewTimingPreview } from "@/lib/review";

type ReviewMode = "phrase_to_meaning" | "meaning_to_phrase" | "english_to_somali" | "somali_to_english";

const modeLabels: Record<ReviewMode, string> = {
  phrase_to_meaning: "Phrase → Meaning",
  meaning_to_phrase: "Meaning → Phrase",
  english_to_somali: "English → Somali",
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
    buttonClassName: "border-orange-400 text-orange-600 hover:bg-orange-50",
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
  if (mode === "phrase_to_meaning" || mode === "english_to_somali") return "Prompt";
  if (mode === "meaning_to_phrase") return "Meaning";
  return "Somali";
}

function getQuestion(phrase: Phrase, mode: ReviewMode) {
  switch (mode) {
    case "phrase_to_meaning":
      return phrase.phraseText;
    case "meaning_to_phrase":
      return phrase.explanation?.easyMeaning || "...";
    case "english_to_somali":
      return phrase.phraseText;
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
    case "english_to_somali":
      return phrase.explanation?.somaliMeaning || "...";
    case "somali_to_english":
      return phrase.phraseText;
  }
}

export default function ReviewPage() {
  const { phrases, getDueForReview, reviewPhrase } = usePhraseStore();
  const { user } = useAuth();
  const dueForReview = getDueForReview();
  const [mode, setMode] = useState<ReviewMode>("phrase_to_meaning");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(0);

  const reviewList = useMemo(() => (dueForReview.length > 0 ? dueForReview : phrases.slice(0, 10)), [dueForReview, phrases]);
  const currentPhrase = reviewList[currentIndex];
  const timingPreview = useMemo(
    () => getReviewTimingPreview(currentPhrase?.review),
    [currentPhrase]
  );
  const reviewStage = useMemo(
    () => getReviewStage(currentPhrase?.review),
    [currentPhrase]
  );

  function speakCurrentPrompt() {
    if (!currentPhrase || !("speechSynthesis" in window)) return;
    const text =
      mode === "english_to_somali" || mode === "phrase_to_meaning"
        ? currentPhrase.phraseText
        : mode === "meaning_to_phrase"
          ? currentPhrase.phraseText
          : currentPhrase.phraseText;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  }

  const goToNextCard = () => {
    setRevealed(false);
    setCurrentIndex((index) => (index < reviewList.length - 1 ? index + 1 : 0));
  };

  const handleRate = (rating: ReviewRating) => {
    if (!currentPhrase) return;
    reviewPhrase(currentPhrase.id, rating);
    setCompleted((count) => count + 1);
    goToNextCard();
  };

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const activeTag = (event.target as HTMLElement | null)?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

      if (!currentPhrase) return;

      if (event.code === "Space") {
        event.preventDefault();
        if (!revealed) {
          setRevealed(true);
        }
        return;
      }

      if (!revealed) return;

      if (event.key === "1") {
        event.preventDefault();
        handleRate("again");
      } else if (event.key === "2") {
        event.preventDefault();
        handleRate("hard");
      } else if (event.key === "3") {
        event.preventDefault();
        handleRate("good");
      } else if (event.key === "4") {
        event.preventDefault();
        handleRate("easy");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPhrase, revealed]);

  useEffect(() => {
    if (!currentPhrase || !user?.autoPlayAudioEnabled) return;
    speakCurrentPrompt();
  }, [currentPhrase?.id, mode, user?.autoPlayAudioEnabled]);

  if (reviewList.length === 0) {
    return (
      <div className="app-page py-16 text-center">
        <RotateCcw className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold text-foreground">No phrases to review</h2>
        <p className="mt-2 text-muted-foreground">Add some phrases first, then come back to review.</p>
        <Link to="/add-phrase"><Button className="mt-4">Add a Phrase</Button></Link>
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
            {completed} reviewed · {reviewList.length} total
          </p>
        </div>

        <div className="mx-auto grid w-fit max-w-full gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(modeLabels) as ReviewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setRevealed(false);
              }}
              className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                mode === m ? "bg-[#161819] text-white" : "bg-muted/40 text-foreground hover:bg-muted"
              }`}
            >
              {modeLabels[m]}
            </button>
          ))}
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
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{getPromptLabel(mode)}</p>
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
                      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Stage</span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-foreground">
                        {reviewStage}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-8 text-3xl font-semibold text-foreground">{getQuestion(currentPhrase, mode)}</p>

              {!revealed ? (
                <div className="mt-8 space-y-4">
                  <Button variant="outline" onClick={() => setRevealed(true)} className="h-11 gap-2 rounded-xl px-5">
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
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Answer</p>
                    <p className="mt-2 text-xl font-semibold text-foreground">{getAnswer(currentPhrase, mode)}</p>

                    {currentPhrase.explanation?.standardMeaning && mode !== "phrase_to_meaning" && (
                      <p className="mt-3 text-sm text-muted-foreground">{currentPhrase.explanation.standardMeaning}</p>
                    )}

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {currentPhrase.explanation?.usageContext ? (
                        <div className="rounded-xl border bg-white px-4 py-3">
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">When People Use This</p>
                          <p className="mt-1 text-sm text-foreground">{currentPhrase.explanation.usageContext}</p>
                        </div>
                      ) : null}

                      {user?.somaliModeEnabled && currentPhrase.explanation?.somaliMeaning ? (
                        <div className="rounded-xl border bg-white px-4 py-3">
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Somali</p>
                          <p className="mt-1 text-sm text-foreground">{currentPhrase.explanation.somaliMeaning}</p>
                        </div>
                      ) : null}
                    </div>

                    {currentPhrase.examples && currentPhrase.examples.length > 0 ? (
                      <div className="mt-4 rounded-xl border bg-white px-4 py-3">
                        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          <BookOpen className="h-3.5 w-3.5" />
                          Example
                        </p>
                        <p className="mt-1 text-sm text-foreground">
                          {currentPhrase.examples.find((example) => example.exampleType !== "somali")?.exampleText ?? currentPhrase.examples[0].exampleText}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <p className="mb-3 text-sm text-muted-foreground">How well did you know this?</p>
                    <div className="grid gap-3 sm:grid-cols-4">
                      {ratingConfig.map((item) => (
                        <button
                          key={item.rating}
                          type="button"
                          onClick={() => handleRate(item.rating)}
                          className={`rounded-2xl border bg-white px-4 py-3 text-left transition-colors ${item.buttonClassName}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold">{item.label}</span>
                            <span className="text-xs font-medium opacity-70">{item.shortcut}</span>
                          </div>
                          <p className="mt-2 text-xs font-medium opacity-70">{timingPreview[item.rating].label}</p>
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">Keyboard: `1` Again, `2` Hard, `3` Good, `4` Easy</p>
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
