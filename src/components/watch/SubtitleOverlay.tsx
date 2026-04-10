import { TranscriptCue } from "@/components/watch/types";

interface SubtitleOverlayProps {
  activeCue: TranscriptCue | null;
  translation: string;
}

export function SubtitleOverlay({ activeCue, translation }: SubtitleOverlayProps) {
  if (!activeCue) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-8 flex flex-col items-center gap-1.5 px-6">
      <div className="max-w-[84%] rounded-md bg-black/70 px-5 py-2.5 text-center text-[15px] font-semibold leading-[1.5] text-white shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-[2px]">
        {activeCue.text}
      </div>
      {translation ? (
        <div className="max-w-[80%] rounded-md bg-black/55 px-4 py-1.5 text-center text-[13px] font-medium leading-[1.5] text-white/85 backdrop-blur-[2px]">
          {translation}
        </div>
      ) : null}
    </div>
  );
}
