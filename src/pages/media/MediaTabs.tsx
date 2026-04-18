import { Youtube, Tv, BookOpenText, Headphones, FileText, FolderOpen, GraduationCap, LibraryBig } from "lucide-react";
import { MEDIA_TABS, MediaTabId } from "./mediaTypes";

const TAB_ICONS: Record<MediaTabId, React.ComponentType<{ className?: string }>> = {
  youtube: Youtube,
  netflix: Tv,
  books: BookOpenText,
  fsi_dli: GraduationCap,
  media_file: FolderOpen,
  podcasts: Headphones,
  my_texts: FileText,
  resources: LibraryBig,
};

const MOBILE_TAB_LABELS: Partial<Record<MediaTabId, string>> = {
  youtube: "Videos",
  podcasts: "Audio",
  my_texts: "Texts",
};

interface MediaTabsProps {
  active: MediaTabId;
  onChange: (id: MediaTabId) => void;
  compact?: boolean;
}

export function MediaTabs({ active, onChange, compact = false }: MediaTabsProps) {
  return (
    <div
      className={
        compact
          ? "flex min-w-0 shrink items-center gap-1.5 overflow-x-auto bg-transparent scrollbar-none"
          : "flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border/80 bg-background/60 px-3 py-2 scrollbar-none sm:gap-0 sm:px-4 sm:py-0"
      }
    >
      {MEDIA_TABS.map((tab) => {
        const Icon = TAB_ICONS[tab.id];
        const isActive = tab.id === active;
        const isDisabled = !tab.available;

        return (
          <button
            key={tab.id}
            type="button"
            disabled={isDisabled}
            onClick={() => tab.available && onChange(tab.id)}
            className={[
              compact
                ? "relative flex shrink-0 select-none items-center justify-center rounded-full px-3.5 py-2 text-[12px] font-semibold transition-colors"
                : "relative flex shrink-0 select-none items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold transition-colors sm:gap-2 sm:rounded-none sm:px-4 sm:py-3.5 sm:text-[14px]",
              isActive
                ? compact
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-primary text-primary-foreground shadow-sm sm:bg-transparent sm:text-foreground sm:shadow-none sm:after:absolute sm:after:bottom-0 sm:after:left-0 sm:after:right-0 sm:after:h-[3px] sm:after:bg-primary"
                : isDisabled
                  ? "cursor-not-allowed text-muted-foreground/45"
                  : compact
                    ? "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                    : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground sm:text-muted-foreground",
            ].join(" ")}
          >
            {compact ? null : <Icon className="hidden h-[18px] w-[18px] shrink-0 sm:block" />}
            <span className={compact ? "" : "sm:hidden"}>{MOBILE_TAB_LABELS[tab.id] ?? tab.label}</span>
            {compact ? null : <span className="hidden sm:inline">{tab.label}</span>}
            {tab.badge ? (
              <span className="ml-1 rounded border border-primary/40 bg-primary/15 px-1 py-0.5 text-[8px] font-bold text-primary">
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
