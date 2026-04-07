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
        "group grid w-full grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start gap-0 border-b border-white/[0.05] text-left transition-colors",
        active ? "bg-[#2b3038]" : "hover:bg-white/[0.03]",
      )}
    >
      <div className="border-r border-white/[0.05] px-4 py-3">
        <p className={cn("text-[13px] leading-[1.55] text-white/84", active && "text-white")}>{cue.text}</p>
        <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-white/26">{formatTime(cue.start)}</p>
      </div>

      <div className="px-4 py-3">
        <p className="text-[13px] leading-[1.55] text-white/54">{cue.translation || ""}</p>
      </div>
    </button>
  );
}
