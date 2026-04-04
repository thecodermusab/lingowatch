import { Bookmark, Settings, Star, X } from "lucide-react";
import { SavedPhrase, TranscriptCue, TranscriptTab, WordInsight } from "@/components/watch/types";
import { TranscriptTabs } from "@/components/watch/TranscriptTabs";
import { TranscriptList } from "@/components/watch/TranscriptList";
import { cn } from "@/lib/utils";

interface TranscriptPanelProps {
  activeTab: TranscriptTab;
  onTabChange: (tab: TranscriptTab) => void;
  cues: TranscriptCue[];
  activeCueId: string | null;
  onSelectCue: (cue: TranscriptCue) => void;
  wordInsights: WordInsight[];
  savedPhrases: SavedPhrase[];
}

export function TranscriptPanel({
  activeTab,
  onTabChange,
  cues,
  activeCueId,
  onSelectCue,
  wordInsights,
  savedPhrases,
}: TranscriptPanelProps) {
  return (
    <aside className="flex min-h-[420px] flex-col border-l border-white/8 bg-[#101214] xl:min-h-0">
      <div className="flex h-9 items-center justify-between border-b border-white/8 bg-[#121315] px-3">
        <TranscriptTabs activeTab={activeTab} onChange={onTabChange} />
        <div className="flex items-center gap-1 text-white/55">
          <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded-sm hover:bg-white/6 hover:text-white">
            <Settings className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded-sm hover:bg-white/6 hover:text-white">
            <Bookmark className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded-sm hover:bg-white/6 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {activeTab === "subtitles" ? (
        <TranscriptList cues={cues} activeCueId={activeCueId} onSelect={onSelectCue} />
      ) : null}

      {activeTab === "words" ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#111315] p-2">
          {wordInsights.map((item) => (
            <div
              key={item.term}
              className="flex items-start justify-between gap-3 border-b border-white/5 bg-[#14161a] px-3 py-2.5 last:border-b-0"
            >
              <div>
                <p className="text-[12.5px] font-semibold text-white">{item.term}</p>
                <p className="mt-1 text-[11px] leading-[1.45] text-white/52">{item.meaning}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-[10px] font-semibold text-white/46">
                <span>{item.level}</span>
                <span>{item.count}x</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {activeTab === "saved" ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#111315] p-2">
          {savedPhrases.map((item) => (
            <div
              key={item.term}
              className="flex items-start justify-between gap-3 border-b border-white/5 bg-[#14161a] px-3 py-2.5 last:border-b-0"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[12.5px] font-semibold text-white">{item.term}</p>
                  <Star className="h-3 w-3 text-[#8f93ff]" fill="currentColor" strokeWidth={1.4} />
                </div>
                <p className="mt-1 text-[11px] leading-[1.45] text-white/52">{item.note}</p>
              </div>
              <span className={cn("shrink-0 font-mono text-[10px] text-white/34")}>{item.timestamp}</span>
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
