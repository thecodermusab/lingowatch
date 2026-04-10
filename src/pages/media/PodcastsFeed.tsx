
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Loader2, PlayCircle } from "lucide-react";
import { PodcastEpisode } from "./mediaTypes";
import { useNavigate } from "react-router-dom";

async function fetchEpisodes(podcastId: string): Promise<PodcastEpisode[]> {
  const res = await fetch(`/api/podcasts/${podcastId}/episodes`);
  if (!res.ok) throw new Error("Failed to fetch episodes");
  return res.json();
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

export function PodcastsFeed({ selectedPodcast }: { selectedPodcast: string | null }) {
  const navigate = useNavigate();
  const { data: episodes, isLoading } = useQuery({
    queryKey: ['podcasts', selectedPodcast, 'episodes'],
    queryFn: () => selectedPodcast ? fetchEpisodes(selectedPodcast) : Promise.resolve([]),
    enabled: !!selectedPodcast
  });

  return (
    <section className="flex flex-col flex-1 bg-[#1e1e1e] min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-[#a855f7] scrollbar-track-transparent">
      
      {!selectedPodcast ? (
        <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
          <div className="w-20 h-20 rounded-full bg-[#2a2a2a] flex items-center justify-center mb-6 shadow-inset">
            <svg className="w-10 h-10 text-[#666]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h2 className="text-[#eee] text-xl font-medium tracking-wide">Select a Podcast</h2>
          <p className="text-[#888] mt-3 max-w-md leading-relaxed text-[15px]">
            Choose a podcast from the sidebar to browse episodes.
          </p>
        </div>
      ) : (
        <div className="flex flex-col pb-10">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-[#888]" />
            </div>
          ) : episodes?.length === 0 ? (
            <div className="p-10 text-center text-[#888]">No episodes found for this podcast. Please wait for feeds to sync.</div>
          ) : (
            episodes?.map((episode, index) => (
              <div 
                key={episode.id} 
                onClick={() => navigate(`/listen/${episode.id}`)}
                className="group flex relative p-5 transition-colors hover:bg-[#282828] cursor-pointer border-b border-[#2a2a2a] last:border-0 pl-12 pr-8 gap-5 items-start"
              >
                
                {/* Number track */}
                <div className="absolute left-6 text-[11px] font-medium text-[#666] pt-2">
                  {index + 1}
                </div>

                {/* Thumbnail */}
                <div className="relative w-[110px] h-[110px] shrink-0 rounded-xl overflow-hidden shadow-md flex items-center justify-center bg-[#252525] border border-white/5">
                  {episode.artwork_url ? (
                    <img src={episode.artwork_url} alt={episode.title} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-serif font-bold text-center text-white/50 px-2 leading-tight uppercase text-sm">POD</span>
                  )}
                  {/* Duration Badge */}
                  <div className="absolute bottom-0 right-0 bg-black/80 text-white/90 text-[10px] font-bold px-1.5 py-0.5 m-1 rounded-[4px] tracking-wide">
                    {formatDuration(episode.duration_seconds)}
                  </div>
                  
                  {/* Play Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <PlayCircle className="w-10 h-10 text-white drop-shadow-md" />
                  </div>
                </div>

                {/* Content */}
                <div className="flex flex-col flex-1">
                  <h3 className="text-[17px] font-medium text-[#f0f0f0] tracking-wide line-clamp-2">
                    {episode.title}
                  </h3>
                  
                  <div className="flex items-center gap-2 mt-2">
                     {episode.transcript_status === 'official_rss_feed' && (
                       <span className="bg-[#a855f7]/20 text-[#d8b4fe] text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-[4px] tracking-wider border border-[#a855f7]/30">
                         Official Transcript
                       </span>
                     )}
                     <span className="text-[#666] text-[12px] font-medium tracking-wide">
                       {episode.published_at ? formatDistanceToNow(new Date(episode.published_at), { addSuffix: true }) : 'Unknown date'}
                     </span>
                  </div>
                  
                  <p className="text-[#999] text-[13px] leading-relaxed mt-3 max-w-4xl line-clamp-2">
                    {episode.description}
                  </p>
                </div>

              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
