import { Pin, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PodcastChannel } from "./mediaTypes";

async function fetchPodcasts(): Promise<PodcastChannel[]> {
  const res = await fetch("/api/podcasts");
  if (!res.ok) throw new Error("Failed to fetch podcasts");
  return res.json();
}

function getInitials(title: string) {
  const parts = title.split(" ").filter(w => w.match(/[a-zA-Z]/));
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (title.length > 1) return title.substring(0, 2).toUpperCase();
  return "P";
}

const COLORS = ["#eab308", "#22c55e", "#ef4444", "#ca8a04", "#dc2626", "#ea580c", "#f97316", "#b91c1c", "#a855f7"];
function getColor(title: string) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = Math.imul(31, h) + title.charCodeAt(i) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
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
    <aside className="w-[260px] shrink-0 flex flex-col bg-[#222222] border-r border-[#3e3e3e] overflow-hidden text-white h-full">
      <div className="py-5 text-center">
        <span className="text-[14px] text-[#a0a0a0] font-semibold tracking-wide">PODCASTS</span>
      </div>

      <div className="px-3 mb-4">
        <button 
          onClick={() => onSelect(null)}
          className={`w-full flex items-center gap-4 rounded-lg p-2 transition-colors hover:bg-[#444] ${!selectedPodcast ? "bg-[#444]" : "bg-[#3a3a3a]"}`}
        >
          <div className="w-8 h-8 rounded shrink-0 bg-[#3fbb91] flex items-center justify-center text-white font-medium text-[15px]">
            E
          </div>
          <span className="text-[14.5px] font-medium text-white tracking-wide">All podcasts</span>
        </button>
      </div>

      <div className="flex items-center gap-2 px-6 mb-3">
        <div className="h-[1px] flex-1 bg-[#333]"></div>
        <span className="text-[9px] uppercase tracking-widest text-[#777] font-semibold">LIBRARY</span>
        <div className="h-[1px] flex-1 bg-[#333]"></div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#555] scrollbar-track-transparent">
        <div className="flex flex-col gap-1 px-3 pb-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-[#666]" />
            </div>
          ) : channels?.map((channel) => {
             const isSelected = selectedPodcast === channel.id;
             return (
              <button 
                key={channel.id} 
                onClick={() => onSelect(channel.id)}
                className={`flex items-center group gap-4 rounded-lg p-2.5 transition-colors hover:bg-[#2c2c2c] w-full text-left ${isSelected ? "bg-[#2c2c2c] ring-1 ring-white/10" : ""}`}
              >
                <div 
                  className="w-9 h-9 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[13px] font-bold shadow-md border border-black/20"
                  style={!channel.artwork_url ? { backgroundColor: getColor(channel.title || ''), color: '#fff' } : undefined}
                >
                  {channel.artwork_url ? (
                    <img src={channel.artwork_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    getInitials(channel.title || '')
                  )}
                </div>
                <span className="text-[14px] text-[#cccccc] truncate flex-1 font-medium tracking-wide">
                  {channel.title}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  );
}
