
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
    <section className="flex flex-1 min-h-0 flex-col overflow-y-auto bg-background scrollbar-thin scrollbar-thumb-primary/50 scrollbar-track-transparent">
      
      {!selectedPodcast ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-secondary shadow-inset sm:h-20 sm:w-20">
            <svg className="h-8 w-8 text-muted-foreground sm:h-10 sm:w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h2 className="text-[18px] font-semibold tracking-wide text-foreground sm:text-xl">Choose audio</h2>
          <p className="mt-2 max-w-xs text-[13px] leading-6 text-muted-foreground sm:max-w-md sm:text-[15px]">
            Pick a podcast above to browse episodes.
          </p>
        </div>
      ) : (
        <div className="flex flex-col pb-10">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center min-h-[300px]">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : episodes?.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">No episodes found for this podcast. Please wait for feeds to sync.</div>
          ) : (
            episodes?.map((episode, index) => (
               <button
                 key={episode.id}
                 onClick={() => navigate(`/listen/${episode.id}`)}
                 className="group relative flex w-full cursor-pointer items-start gap-4 border-b border-border p-4 text-left transition-colors hover:bg-secondary/70 sm:gap-5 sm:p-5 sm:pl-12 sm:pr-8"
               >
                
                {/* Index marker */}
                <div className="hidden absolute left-6 pt-2 text-[11px] font-medium text-muted-foreground sm:block">
                  {episodes.length - index}
                </div>

                {/* Thumbnail Art */}
                 <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card shadow-md sm:h-[110px] sm:w-[110px]">
                   {episode.artwork_url ? (
                     <img src={episode.artwork_url} alt={episode.title} className="w-full h-full object-cover" />
                   ) : (
                     <span className="px-2 text-center font-serif text-sm font-bold uppercase leading-tight text-muted-foreground">POD</span>
                   )}
                   {/* Duration Badge */}
                   <div className="absolute bottom-0 right-0 m-1 rounded-[4px] bg-black/75 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
                     {formatDuration(episode.duration_seconds)}
                   </div>
                   
                   {/* Play Overlay */}
                   <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                     <PlayCircle className="h-8 w-8 text-white drop-shadow-md sm:h-10 sm:w-10" />
                   </div>
                 </div>

                {/* Content */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <h3 className="line-clamp-2 text-[15px] font-medium tracking-wide text-foreground sm:text-[17px]">
                    {episode.title}
                  </h3>
                  
                  <div className="flex items-center gap-2 mt-2">
                     {episode.transcript_status === 'official_rss_feed' && (
                        <span className="rounded-[4px] border border-primary/30 bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                          Official Transcript
                        </span>
                     )}
                     <span className="text-muted-foreground text-[12px] font-medium tracking-wide">
                       {episode.published_at ? formatDistanceToNow(new Date(episode.published_at), { addSuffix: true }) : 'Unknown date'}
                     </span>
                  </div>
                  
                  <p className="mt-2 line-clamp-2 max-w-4xl text-[12px] leading-relaxed text-muted-foreground sm:mt-3 sm:text-[13px]">
                    {episode.description}
                  </p>
                </div>

              </button>
            ))
          )}
        </div>
      )}
    </section>
  );
}
