import { Search, Settings } from "lucide-react";
import { SavedPhrase, TranscriptCue, TranscriptTab, WordInsight } from "@/components/watch/types";
import { TranscriptTabs } from "@/components/watch/TranscriptTabs";
import { TranscriptList } from "@/components/watch/TranscriptList";

interface TranscriptPanelProps {
  activeTab: TranscriptTab;
  onTabChange: (tab: TranscriptTab) => void;
  cues: TranscriptCue[];
  activeCueId: string | null;
  onSelectCue: (cue: TranscriptCue) => void;
  wordInsights: WordInsight[];
  savedPhrases: SavedPhrase[];
  autoScrollEnabled?: boolean;
}

export function TranscriptPanel({
  activeTab,
  onTabChange,
  cues,
  activeCueId,
  onSelectCue,
  wordInsights,
  savedPhrases,
  autoScrollEnabled = true,
}: TranscriptPanelProps) {
  return (
    <aside className="flex min-h-[420px] min-w-0 flex-col border-l border-white/[0.06] bg-[#171b20] xl:min-h-0">
      <div className="flex h-12 items-end justify-between border-b border-white/[0.06] bg-[#15191e] px-4">
        <TranscriptTabs activeTab={activeTab} onChange={onTabChange} />
        <div className="flex items-center gap-1 pb-2 text-white/50">
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-white/[0.05] hover:text-white"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-white/[0.05] hover:text-white"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {activeTab === "subtitles" ? (
        <TranscriptList
          cues={cues}
          activeCueId={activeCueId}
          onSelect={onSelectCue}
          autoScrollEnabled={autoScrollEnabled}
        />
      ) : null}

      {activeTab === "words" ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#171b20] p-2">
          {wordInsights.map((item) => (
            <div key={item.term} className="border-b border-white/[0.05] px-3 py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-white">{item.term}</p>
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/34">
                  {item.level} · {item.count}x
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-6 text-white/58">{item.meaning}</p>
            </div>
          ))}
        </div>
      ) : null}

      {activeTab === "saved" ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#171b20] p-2">
          {savedPhrases.map((item) => (
            <div key={item.term} className="border-b border-white/[0.05] px-3 py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-white">{item.term}</p>
                <span className="text-[10px] font-medium text-white/34">{item.timestamp}</span>
              </div>
              <p className="mt-1 text-[12px] leading-6 text-white/58">{item.note}</p>
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
