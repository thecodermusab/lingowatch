import { TranscriptCue } from "@/components/watch/types";
import { WordWithTooltip } from "@/pages/reader/hidden/WordWithTooltip";
import { RefObject } from "react";

interface VideoPlayerShellProps {
  activeCue: TranscriptCue | null;
  translationLoading: boolean;
  gtTranslation: string;
  savedWordKeys: Set<string>;
  onSaveWord: (word: string, translation: string) => void;
  playerHostRef: RefObject<HTMLDivElement>;
}

function normalizeWordKey(text: string) {
  return text.replace(/[.,!?'"();:\-]/g, "").trim().toLowerCase();
}

function isHoverableWord(part: string) {
  return /[A-Za-z]/.test(part);
}

function HoverableSubtitleText({
  text,
  savedWordKeys,
  onSaveWord,
}: {
  text: string;
  savedWordKeys: Set<string>;
  onSaveWord: (word: string, translation: string) => void;
}) {
  return (
    <>
      {text.split(/(\s+)/).map((part, index) => {
        if (!part || /^\s+$/.test(part) || !isHoverableWord(part)) return part;

        const wordKey = normalizeWordKey(part);
        return (
          <WordWithTooltip
            key={`${part}-${index}`}
            word={part}
            isSaved={savedWordKeys.has(wordKey)}
            onSave={onSaveWord}
            trailingSpace={false}
          />
        );
      })}
    </>
  );
}

export function VideoPlayerShell({
  activeCue,
  translationLoading,
  gtTranslation,
  savedWordKeys,
  onSaveWord,
  playerHostRef,
}: VideoPlayerShellProps) {
  const activeTranslation = activeCue?.translation || "";

  return (
    <section className="flex min-h-0 flex-col bg-background">
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-4 pt-3 lg:px-4">
        <div className="relative overflow-hidden rounded-xl border border-border bg-black shadow-[0_20px_50px_rgba(0,0,0,0.32)]">
          <div className="aspect-video w-full bg-[#090a0c]">
            <div ref={playerHostRef} className="h-full w-full" />
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-border bg-card/90 px-4 py-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <p className="mx-auto max-w-4xl text-[24px] font-medium leading-[1.48] text-foreground">
            {activeCue?.text ? (
              <HoverableSubtitleText text={activeCue.text} savedWordKeys={savedWordKeys} onSaveWord={onSaveWord} />
            ) : (
              "Loading subtitles..."
            )}
          </p>
        </div>

        <div className="px-4 py-2 text-center">
          <p className="mx-auto max-w-4xl text-[17px] leading-[1.6] text-muted-foreground">
            {gtTranslation || (translationLoading ? "Loading translation…" : activeTranslation || "")}
          </p>
        </div>
      </div>
    </section>
  );
}
