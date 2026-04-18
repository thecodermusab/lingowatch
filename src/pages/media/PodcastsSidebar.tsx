import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PodcastChannel } from "./mediaTypes";

async function fetchPodcasts(): Promise<PodcastChannel[]> {
  const res = await fetch("/api/podcasts");
  if (!res.ok) throw new Error("Failed to fetch podcasts");
  return res.json();
}

const COLORS = ["#eab308", "#22c55e", "#ef4444", "#ca8a04", "#dc2626", "#ea580c", "#f97316", "#b91c1c", "#a855f7"];
function getColor(title: string) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = Math.imul(31, h) + title.charCodeAt(i) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

function YouTubeAudioIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <span className={`${className} shrink-0 rounded-full bg-secondary flex items-center justify-center`}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[62%] w-[62%]">
        <path
          fill="#ff0033"
          d="M21.58 7.19a2.65 2.65 0 0 0-1.86-1.88C18.08 4.86 12 4.86 12 4.86s-6.08 0-7.72.45A2.65 2.65 0 0 0 2.42 7.2 27.82 27.82 0 0 0 2 12a27.82 27.82 0 0 0 .42 4.81 2.65 2.65 0 0 0 1.86 1.88c1.64.45 7.72.45 7.72.45s6.08 0 7.72-.45a2.65 2.65 0 0 0 1.86-1.88A27.82 27.82 0 0 0 22 12a27.82 27.82 0 0 0-.42-4.81Z"
        />
        <path fill="#fff" d="M10 15.2V8.8l5.45 3.2L10 15.2Z" />
      </svg>
    </span>
  );
}

interface PodcastsSidebarProps {
  selectedPodcast: string | null;
  onSelect: (id: string | null) => void;
}

export function PodcastsSidebar({ selectedPodcast, onSelect }: PodcastsSidebarProps) {
  const { data: channels, isLoading } = useQuery({
    queryKey: ['podcasts'],
    queryFn: fetchPodcasts
  });

  return (
    <aside className="flex max-h-[44vh] w-full shrink-0 flex-col overflow-hidden border-b border-border bg-card/95 text-foreground lg:h-full lg:max-h-none lg:w-[260px] lg:border-b-0 lg:border-r">
      <div className="px-4 pb-2 pt-4 lg:px-5">
        <span className="text-[12px] font-semibold tracking-wide text-muted-foreground lg:text-[14px]">Audio</span>
      </div>

      <div className="px-3 lg:px-3">
        <button 
          type="button"
          onClick={() => onSelect(null)}
          className={`w-full flex items-center gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-secondary ${!selectedPodcast ? "bg-secondary" : "bg-transparent"}`}
        >
          <YouTubeAudioIcon />
          <span className="text-[14px] font-medium tracking-wide text-foreground">All podcasts</span>
        </button>
      </div>

      <div className="hidden items-center px-5 py-2 lg:flex">
        <div className="h-[1px] flex-1 bg-border"></div>
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold px-3">LIBRARY</span>
        <div className="h-[1px] flex-1 bg-border"></div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-secondary scrollbar-track-transparent">
        <ul className="flex gap-2 overflow-x-auto px-3 pb-4 pt-2 scrollbar-none lg:flex-col lg:gap-0.5 lg:space-y-1 lg:overflow-x-visible lg:pb-8">
          {isLoading ? (
            <div className="flex w-full items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : channels?.map((channel) => {
             const isSelected = selectedPodcast === channel.id;
             return (
              <button 
                type="button"
                key={channel.id} 
                onClick={() => onSelect(channel.id)}
                className={`group flex min-w-[190px] items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-secondary lg:min-w-0 lg:w-full ${isSelected ? "bg-secondary ring-1 ring-border" : ""}`}
              >
                <div 
                  className="w-9 h-9 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[13px] font-bold shadow-md border border-black/20"
                  style={!channel.artwork_url ? { backgroundColor: getColor(channel.title || ''), color: '#fff' } : undefined}
                >
                  {channel.artwork_url ? (
                    <img src={channel.artwork_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <YouTubeAudioIcon className="h-full w-full" />
                  )}
                </div>
                <span className="text-[14px] text-foreground truncate flex-1 font-medium tracking-wide">
                  {channel.title}
                </span>
              </button>
            )
          })}
        </ul>
      </div>
    </aside>
  );
}
