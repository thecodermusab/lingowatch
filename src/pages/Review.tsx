import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { Button } from "@/components/ui/button";
import { RotateCcw, Eye, EyeOff, ChevronRight, CheckCircle2, BookOpen } from "lucide-react";
import { ReviewRating, Phrase } from "@/types";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

type ReviewMode = "phrase_to_meaning" | "meaning_to_phrase" | "english_to_somali" | "somali_to_english";

const modeLabels: Record<ReviewMode, string> = {
  phrase_to_meaning: "Phrase → Meaning",
  meaning_to_phrase: "Meaning → Phrase",
  english_to_somali: "English → Somali",
  somali_to_english: "Somali → English",
};

export default function ReviewPage() {
  const { user } = useAuth();
  const { phrases, getDueForReview, reviewPhrase } = usePhraseStore(user?.id);
  const dueForReview = getDueForReview();
  const [mode, setMode] = useState<ReviewMode>("phrase_to_meaning");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(0);

  const reviewList = useMemo(() => (dueForReview.length > 0 ? dueForReview : phrases.slice(0, 10)), [dueForReview, phrases]);
  const currentPhrase = reviewList[currentIndex];

  const handleRate = (rating: ReviewRating) => {
    if (!currentPhrase) return;
    reviewPhrase(currentPhrase.id, rating);
    setCompleted((c) => c + 1);
    setRevealed(false);
    if (currentIndex < reviewList.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setCurrentIndex(0);
    }
  };

  const getQuestion = (phrase: Phrase) => {
    switch (mode) {
      case "phrase_to_meaning": return phrase.phraseText;
      case "meaning_to_phrase": return phrase.explanation?.easyMeaning || "...";
      case "english_to_somali": return phrase.phraseText;
      case "somali_to_english": return phrase.explanation?.somaliMeaning || "...";
    }
  };

  const getAnswer = (phrase: Phrase) => {
    switch (mode) {
      case "phrase_to_meaning": return phrase.explanation?.easyMeaning || phrase.explanation?.standardMeaning || "...";
      case "meaning_to_phrase": return phrase.phraseText;
      case "english_to_somali": return phrase.explanation?.somaliMeaning || "...";
      case "somali_to_english": return phrase.phraseText;
    }
  };

  if (reviewList.length === 0) {
    return (
      <div className="container py-16 text-center">
        <RotateCcw className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold text-foreground">No phrases to review</h2>
        <p className="mt-2 text-muted-foreground">Add some phrases first, then come back to review!</p>
        <Link to="/add-phrase"><Button className="mt-4">Add a Phrase</Button></Link>
      </div>
    );
  }

  return (
    <div className="container max-w-lg py-8">
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Review Flashcards</h1>
          <p className="text-muted-foreground">
            {completed} reviewed · {reviewList.length} total
          </p>
        </div>

        {/* Mode Selector */}
        <div className="flex flex-wrap justify-center gap-2">
          {(Object.keys(modeLabels) as ReviewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setRevealed(false); }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === m ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {modeLabels[m]}
            </button>
          ))}
        </div>

        {/* Flashcard */}
        {currentPhrase && (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPhrase.id + mode + currentIndex}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="rounded-2xl border bg-card p-8 text-center shadow-sm"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {mode === "phrase_to_meaning" || mode === "english_to_somali" ? "Phrase" : mode === "meaning_to_phrase" ? "Meaning" : "Somali"}
              </p>
              <p className="mt-4 text-2xl font-bold text-foreground">{getQuestion(currentPhrase)}</p>

              {!revealed ? (
                <Button variant="outline" onClick={() => setRevealed(true)} className="mt-8 gap-2">
                  <Eye className="h-4 w-4" /> Show Answer
                </Button>
              ) : (
                <div className="mt-6 space-y-6">
                  <div className="rounded-xl bg-primary/5 p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-primary">Answer</p>
                    <p className="mt-2 text-xl font-semibold text-foreground">{getAnswer(currentPhrase)}</p>
                  </div>
                  <div>
                    <p className="mb-3 text-sm text-muted-foreground">How well did you know this?</p>
                    <div className="flex justify-center gap-3">
                      <Button onClick={() => handleRate("hard")} variant="outline" className="border-destructive text-destructive hover:bg-destructive/10">
                        Hard
                      </Button>
                      <Button onClick={() => handleRate("medium")} variant="outline" className="border-accent text-accent-foreground hover:bg-accent/10">
                        Medium
                      </Button>
                      <Button onClick={() => handleRate("easy")} variant="outline" className="border-success text-success hover:bg-success/10">
                        Easy
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <p className="mt-6 text-xs text-muted-foreground">
                {currentIndex + 1} / {reviewList.length}
              </p>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
