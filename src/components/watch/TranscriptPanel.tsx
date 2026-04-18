import { TranscriptCue, TranscriptTab } from "@/components/watch/types";
import { TranscriptTabs } from "@/components/watch/TranscriptTabs";
import { TranscriptList } from "@/components/watch/TranscriptList";

interface TranscriptPanelProps {
  activeTab: TranscriptTab;
  onTabChange: (tab: TranscriptTab) => void;
  cues: TranscriptCue[];
  activeCueId: string | null;
  onSelectCue: (cue: TranscriptCue) => void;
  autoScrollEnabled?: boolean;
}

export function TranscriptPanel({
  activeTab,
  onTabChange,
  cues,
  activeCueId,
  onSelectCue,
  autoScrollEnabled = true,
}: TranscriptPanelProps) {
  return (
    <aside className="hidden min-h-[420px] min-w-0 flex-col border-l border-border bg-card/92 xl:flex xl:min-h-0">
      <div className="flex h-12 items-end border-b border-border bg-card px-4">
        <TranscriptTabs activeTab={activeTab} onChange={onTabChange} />
      </div>

      {activeTab === "subtitles" ? (
        <TranscriptList
          cues={cues}
          activeCueId={activeCueId}
          onSelect={onSelectCue}
          autoScrollEnabled={autoScrollEnabled}
        />
      ) : null}
    </aside>
  );
}
