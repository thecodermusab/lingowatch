import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { translateText } from "@/lib/googleTranslate";

const wordTranslationCache: Record<string, string> = {};

interface WordWithTooltipProps {
  word: string;
  onSave?: (word: string, translation: string) => void;
  isSaved?: boolean;
  disabled?: boolean;
  trailingSpace?: boolean;
}

export function WordWithTooltip({ word, onSave, isSaved, disabled, trailingSpace = true }: WordWithTooltipProps) {
  const [translation, setTranslation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const cleanWord = word.replace(/[.,!?'"();:\-]/g, "").toLowerCase();

  useEffect(() => {
    if (!isOpen || !cleanWord) return;
    if (wordTranslationCache[cleanWord]) {
      setTranslation(wordTranslationCache[cleanWord]);
      return;
    }

    const fetchTranslation = async () => {
      setIsLoading(true);
      try {
        const result = await translateText(cleanWord, { source: "en", target: "so" });
        wordTranslationCache[cleanWord] = result;
        setTranslation(result);
      } catch (e) {
        console.error("Translation error", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTranslation();
  }, [isOpen, cleanWord]);

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onSave || !translation) return;
    onSave(cleanWord, translation);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
  };

  const saved = isSaved || justSaved;

  if (disabled) {
    return (
      <span className="relative -mx-[1px] px-[1px]">
        {word}{trailingSpace ? " " : ""}
      </span>
    );
  }

  const handleOpenChange = (open: boolean) => {
    if (open) {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) {
        setIsOpen(false);
        return;
      }
    }
    setIsOpen(open);
  };

  return (
    <HoverCard open={isOpen} openDelay={300} closeDelay={100} onOpenChange={handleOpenChange}>
      <HoverCardTrigger asChild>
        <span
          className={`cursor-pointer rounded-[2px] transition-colors duration-150 relative -mx-[1px] px-[1px] ${
            saved
              ? "underline decoration-[#a855f7] decoration-dotted underline-offset-[3px]"
              : "hover:bg-white/10"
          }`}
        >
          {word}{trailingSpace ? " " : ""}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="center"
        className="w-auto min-w-[100px] max-w-[140px] bg-[#2B2D31] border border-[#3E4044] shadow-2xl rounded-[10px] p-0 overflow-hidden flex flex-col font-sans"
        sideOffset={6}
      >
        <div className="flex flex-col items-center justify-center px-3 py-3 min-h-[72px] gap-1.5">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-white/50" />
          ) : translation ? (
            <span className="text-[16px] leading-tight font-sans tracking-wide text-[#F3F4F6] text-center px-1">
              {translation}
            </span>
          ) : (
            <span className="text-white/30 text-[13px]">...</span>
          )}
        </div>

        <div className="px-1.5 pb-1.5">
          <button
            onClick={handleSave}
            disabled={!translation}
            className={`flex items-center justify-center gap-1.5 w-full h-[34px] rounded-[7px] text-[11px] font-medium transition-colors ${
              saved
                ? "bg-[#a855f7]/20 text-[#a855f7]"
                : "bg-[#404249] hover:bg-[#a855f7]/20 text-white/60 hover:text-[#a855f7]"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill={saved ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-[13px] h-[13px]"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
