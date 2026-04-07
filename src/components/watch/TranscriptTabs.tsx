import { TranscriptTab } from "@/components/watch/types";
import { cn } from "@/lib/utils";

interface TranscriptTabsProps {
  activeTab: TranscriptTab;
  onChange: (tab: TranscriptTab) => void;
}

const tabs: Array<{ id: TranscriptTab; label: string }> = [
  { id: "subtitles", label: "TEXT" },
  { id: "words", label: "WORDS" },
  { id: "saved", label: "SAVED" },
];

export function TranscriptTabs({ activeTab, onChange }: TranscriptTabsProps) {
  return (
    <div className="flex items-center gap-5">
      {tabs.map((tab) => {
        const active = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative pb-2 text-[12px] font-semibold tracking-[0.08em] text-white/42 transition hover:text-white/78",
              active && "text-white",
            )}
          >
            {tab.label}
            <span
              className={cn(
                "absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-transparent transition",
                active && "bg-white",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
