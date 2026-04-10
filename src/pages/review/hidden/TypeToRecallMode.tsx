// Hidden feature — Type-to-Recall mode for the Review page.
// To re-enable: add typeMode state + toggle button back to Review.tsx
// and wire up the input block below in place of the "Show Answer" button.

import { useRef, useState } from "react";
import { CheckCircle2, Keyboard, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Phrase } from "@/types";

type ReviewMode = "phrase_to_meaning" | "meaning_to_phrase" | "english_to_somali" | "somali_to_english";

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

function isAnswerCorrect(typed: string, phrase: Phrase, mode: ReviewMode): boolean {
  const correct = getAnswer(phrase, mode).toLowerCase().trim();
  const attempt = typed.toLowerCase().trim();
  if (!attempt) return false;
  return attempt === correct;
}

interface TypeToRecallInputProps {
  phrase: Phrase;
  mode: ReviewMode;
  onChecked: (result: "correct" | "wrong", typed: string) => void;
}

export function TypeToRecallInput({ phrase, mode, onChecked }: TypeToRecallInputProps) {
  const [typedAnswer, setTypedAnswer] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCheck = () => {
    if (!typedAnswer.trim()) return;
    const correct = isAnswerCorrect(typedAnswer, phrase, mode);
    onChecked(correct ? "correct" : "wrong", typedAnswer);
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="text"
        value={typedAnswer}
        onChange={(e) => setTypedAnswer(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleCheck(); }}
        placeholder="Type your answer..."
        className="w-full rounded-xl border bg-muted/20 px-4 py-3 text-center text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <Button
        onClick={handleCheck}
        disabled={!typedAnswer.trim()}
        className="h-11 gap-2 rounded-xl px-5"
      >
        Check Answer
      </Button>
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Keyboard className="h-3.5 w-3.5" />
        <span>Press Enter to check</span>
      </div>
    </div>
  );
}

interface TypeResultBannerProps {
  result: "correct" | "wrong";
  typedAnswer: string;
}

export function TypeResultBanner({ result, typedAnswer }: TypeResultBannerProps) {
  return (
    <>
      <div
        className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
          result === "correct"
            ? "bg-success/10 text-success"
            : "bg-destructive/10 text-destructive"
        }`}
      >
        {result === "correct" ? (
          <><CheckCircle2 className="h-4 w-4" /> Correct!</>
        ) : (
          <><XCircle className="h-4 w-4" /> Not quite — see the answer below</>
        )}
      </div>
      {result === "wrong" && (
        <p className="text-sm text-muted-foreground">
          You typed: <span className="font-medium text-foreground">"{typedAnswer}"</span>
        </p>
      )}
    </>
  );
}
