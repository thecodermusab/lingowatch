import { useEffect, useRef } from "react";
import { TranscriptCue } from "@/components/watch/types";
import { TranscriptRow } from "@/components/watch/TranscriptRow";

interface TranscriptListProps {
  cues: TranscriptCue[];
  activeCueId: string | null;
  onSelect: (cue: TranscriptCue) => void;
}

export function TranscriptList({ cues, activeCueId, onSelect }: TranscriptListProps) {
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!activeCueId) {
      return;
    }

    const activeNode = rowRefs.current[activeCueId];
    activeNode?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeCueId]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#111315]">
      {cues.map((cue) => (
        <div key={cue.id} ref={(node) => (rowRefs.current[cue.id] = node)}>
          <TranscriptRow cue={cue} active={cue.id === activeCueId} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}
