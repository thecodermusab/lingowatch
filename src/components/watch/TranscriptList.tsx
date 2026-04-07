import { useEffect, useRef } from "react";
import { TranscriptCue } from "@/components/watch/types";
import { TranscriptRow } from "@/components/watch/TranscriptRow";

interface TranscriptListProps {
  cues: TranscriptCue[];
  activeCueId: string | null;
  onSelect: (cue: TranscriptCue) => void;
  autoScrollEnabled?: boolean;
}

export function TranscriptList({ cues, activeCueId, onSelect, autoScrollEnabled = true }: TranscriptListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previousCueIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeCueId) return;

    const cueChanged = previousCueIdRef.current !== activeCueId;
    previousCueIdRef.current = activeCueId;

    if (!autoScrollEnabled || !cueChanged) {
      return;
    }

    const container = containerRef.current;
    const row = rowRefs.current[activeCueId];
    if (!container || !row) return;

    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    const viewportTop = container.scrollTop;
    const viewportBottom = viewportTop + container.clientHeight;
    const padding = 24;

    if (rowTop < viewportTop + padding) {
      container.scrollTo({
        top: Math.max(rowTop - padding, 0),
        behavior: "auto",
      });
      return;
    }

    if (rowBottom > viewportBottom - padding) {
      container.scrollTo({
        top: Math.max(rowBottom - container.clientHeight + padding, 0),
        behavior: "auto",
      });
    }
  }, [activeCueId, autoScrollEnabled]);

  return (
    <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto bg-[#171b20] [overflow-anchor:none]">
      {cues.map((cue) => (
        <div key={cue.id} ref={(node) => (rowRefs.current[cue.id] = node)}>
          <TranscriptRow cue={cue} active={cue.id === activeCueId} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}
