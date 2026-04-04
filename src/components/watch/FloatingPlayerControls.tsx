import { ChevronLeft, ChevronRight, RotateCcw, ToggleLeft, ToggleRight } from "lucide-react";

interface FloatingPlayerControlsProps {
  autoPause: boolean;
  onToggleAutoPause: () => void;
}

const sideControls = [
  { icon: ChevronRight, label: "Next line" },
  { icon: RotateCcw, label: "Replay line" },
  { icon: ChevronLeft, label: "Previous line" },
];

export function FloatingPlayerControls({ autoPause, onToggleAutoPause }: FloatingPlayerControlsProps) {
  return (
    <>
      <div className="absolute left-3 top-1/2 flex -translate-y-1/2 flex-col gap-3">
        {sideControls.map(({ icon: Icon, label }, index) => (
          <button
            key={index}
            type="button"
            aria-label={label}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white/58 backdrop-blur-[2px] transition hover:bg-black/34 hover:text-white/84"
          >
            <Icon className="h-4 w-4" strokeWidth={2.1} />
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onToggleAutoPause}
        className="absolute bottom-5 right-3 inline-flex items-center gap-1 rounded-full bg-black/18 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/52 backdrop-blur-[2px] transition hover:bg-black/28 hover:text-white/76"
      >
        <span>AP</span>
        {autoPause ? <ToggleRight className="h-4 w-4 text-[#9ea4ff]" /> : <ToggleLeft className="h-4 w-4" />}
      </button>
    </>
  );
}
