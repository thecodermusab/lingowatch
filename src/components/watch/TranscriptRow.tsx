import { Play, Star } from "lucide-react";
import { TranscriptCue } from "@/components/watch/types";
import { cn } from "@/lib/utils";

interface TranscriptRowProps {
  cue: TranscriptCue;
  active: boolean;
  onSelect: (cue: TranscriptCue) => void;
}

function formatTime(timeInSeconds: number) {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

export function TranscriptRow({ cue, active, onSelect }: TranscriptRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(cue)}
      className={cn(
        "group grid w-full grid-cols-[18px_42px_1fr_18px] items-start gap-2 border-b border-white/5 bg-[#14161a] px-2.5 py-2 text-left transition",
        active ? "bg-[#1f2126]" : "hover:bg-[#191b20]"
      )}
    >
      <span className="pt-1.5">
        <span className={cn("block h-2 w-2 rounded-full bg-transparent transition", active && "bg-[#8f93ff]")} />
      </span>
      <span
        className={cn(
          "pt-0.5 font-mono text-[10px] tracking-tight text-white/34 transition",
          active && "text-white/72"
        )}
      >
        {formatTime(cue.start)}
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            "line-clamp-2 text-[12.5px] leading-[1.45] text-white/86 transition",
            active && "text-white"
          )}
        >
          {cue.text}
        </p>
      </div>
      <div className="flex flex-col items-center gap-1 pt-0.5 text-white/0 transition group-hover:text-white/36">
        <Play className="h-3 w-3" fill="currentColor" strokeWidth={1.8} />
        <Star className="h-3 w-3" strokeWidth={1.8} />
      </div>
    </button>
  );
}
