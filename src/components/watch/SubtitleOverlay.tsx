import { TranscriptCue } from "@/components/watch/types";

interface SubtitleOverlayProps {
  activeCue: TranscriptCue | null;
  upcomingCue: TranscriptCue | null;
}

export function SubtitleOverlay({ activeCue, upcomingCue }: SubtitleOverlayProps) {
  if (!activeCue) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-7 flex flex-col items-center gap-2 px-6">
      <div className="max-w-[78%] rounded-md bg-black/58 px-5 py-3 text-center text-[15px] font-semibold leading-[1.45] text-white shadow-[0_10px_28px_rgba(0,0,0,0.34)] backdrop-blur-[2px]">
        {activeCue.text}
      </div>
      <div className="max-w-[72%] rounded-md bg-black/46 px-4 py-2 text-center text-[12.5px] font-medium leading-[1.45] text-white/78 backdrop-blur-[2px]">
        {upcomingCue?.text ?? activeCue.translation}
      </div>
    </div>
  );
}
