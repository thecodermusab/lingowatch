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

interface MediaTabsProps {
  active: MediaTabId;
  onChange: (id: MediaTabId) => void;
}

export function MediaTabs({ active, onChange }: MediaTabsProps) {
  return (
    <div className="flex shrink-0 items-center overflow-x-auto border-b border-[#3e3e3e] bg-[#222222] px-4 scrollbar-none">
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
              "relative flex shrink-0 items-center gap-2 px-4 py-3.5 text-[14px] transition-all",
              isActive
                ? "font-semibold text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[3px] after:bg-white"
                : isDisabled
                  ? "cursor-not-allowed text-white/30"
                  : "font-medium text-white/80 hover:bg-white/5 hover:text-white",
            ].join(" ")}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {tab.label}
            {tab.badge ? (
              <span className="ml-1 rounded border border-[#0d74ce] bg-[#0d74ce]/20 px-1 py-0.5 text-[8px] font-bold text-[#42a5f5]">
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
