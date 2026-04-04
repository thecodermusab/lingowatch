import { TranscriptTab } from "@/components/watch/types";
import { cn } from "@/lib/utils";

interface TranscriptTabsProps {
  activeTab: TranscriptTab;
  onChange: (tab: TranscriptTab) => void;
}

const tabs: TranscriptTab[] = ["subtitles", "words", "saved"];

export function TranscriptTabs({ activeTab, onChange }: TranscriptTabsProps) {
  return (
    <div className="flex items-center gap-4">
      {tabs.map((tab) => {
        const active = activeTab === tab;

        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            className={cn(
              "relative pb-1 text-[12.5px] font-semibold capitalize tracking-[0.01em] text-white/52 transition hover:text-white/84",
              active && "text-white"
            )}
          >
            {tab}
            <span
              className={cn(
                "absolute inset-x-0 -bottom-[9px] h-[2px] rounded-full bg-transparent transition",
                active && "bg-white/90"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
