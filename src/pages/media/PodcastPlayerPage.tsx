import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, FastForward, Loader2, Share2, Copy } from "lucide-react";

interface ExtendedEpisode {
  id: string;
  podcast_id: string;
  title: string;
  description: string;
  published_at: string;
  duration_seconds: number;
  audio_url: string;
  podcast_title: string;
  podcast_artwork: string;
  transcript_status: string;
}

// Ensure proper padding for time components
const padTime = (num: number) => num.toString().padStart(2, '0');

interface TranscriptSegment {
  id: string;
  start_ms: number;
  end_ms: number;
  text: string;
}

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${padTime(m)}:${padTime(s)}`;
  return `${padTime(m)}:${padTime(s)}`;
};

export default function PodcastPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: episode, isLoading, error } = useQuery<ExtendedEpisode>({
    queryKey: ['episode', id],
    queryFn: async () => {
      const res = await fetch(`/api/episodes/${id}`);
      if (!res.ok) throw new Error("Could not load episode");
      return res.json();
    },
    enabled: !!id
  });

  const { data: transcriptData, isLoading: isTranscriptLoading } = useQuery<{ status: string; segments: TranscriptSegment[] }>({
    queryKey: ['transcript', id],
    queryFn: async () => {
      const res = await fetch(`/api/episodes/${id}/transcript`);
      if (!res.ok) throw new Error("Could not load transcript");
      return res.json();
    },
    enabled: !!id,
    refetchInterval: (query) => {
       const status = query.state.data?.status;
       return status === 'pending' ? 3000 : false;
    }
  });

  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active transcript segment
  useEffect(() => {
    if (activeSegmentRef.current && transcriptContainerRef.current) {
      activeSegmentRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentTime]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const setAudioData = () => {
      setDuration(audio.duration);
      setCurrentTime(audio.currentTime);
    };

    const setAudioTime = () => setCurrentTime(audio.currentTime);
    const handleAudioEnd = () => setIsPlaying(false);

    audio.addEventListener("loadeddata", setAudioData);
    audio.addEventListener("timeupdate", setAudioTime);
    audio.addEventListener("ended", handleAudioEnd);

    return () => {
      audio.removeEventListener("loadeddata", setAudioData);
      audio.removeEventListener("timeupdate", setAudioTime);
      audio.removeEventListener("ended", handleAudioEnd);
    };
  }, [episode, audioRef.current]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    setCurrentTime(time);
  };

  const skip = (seconds: number) => {
    if (audioRef.current) {
      const newTime = Math.max(0, Math.min(audioRef.current.currentTime + seconds, duration));
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const changeSpeed = () => {
    let newRate = playbackRate === 1 ? 1.25 : playbackRate === 1.25 ? 1.5 : playbackRate === 1.5 ? 2.0 : 1;
    setPlaybackRate(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleTranscriptClick = (startMs: number) => {
    const time = startMs / 1000;
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    setCurrentTime(time);
  };

  if (isLoading) return (
    <div className="min-h-screen bg-[#121212] flex items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin text-[#a855f7]" />
    </div>
  );

  if (error || !episode) return (
    <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center text-white">
      <p className="text-xl">Episode not found.</p>
      <Link to="/media" className="mt-4 text-[#a855f7] hover:underline">Back to library</Link>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0a] text-white">
      {/* Top Header */}
      <header className="flex items-center justify-between p-6 border-b border-white/5">
        <Link to="/media" className="flex items-center gap-3 text-white/70 hover:text-white transition-colors group">
          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
             <ArrowLeft className="w-5 h-5" />
          </div>
          <span className="font-medium tracking-wide">Back to Podcasts</span>
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative max-w-7xl mx-auto w-full">
        {/* Left visually rich player side */}
        <section className="flex-1 flex flex-col items-center justify-center p-10 h-full">
           <div className="max-w-md w-full flex flex-col items-center gap-10">
              
              {/* Artwork */}
              <div className="w-64 h-64 md:w-80 md:h-80 rounded-2xl overflow-hidden shadow-2xl relative">
                 {episode.podcast_artwork ? (
                   <img src={episode.podcast_artwork} className="w-full h-full object-cover transform transition-transform hover:scale-105 duration-700" alt={episode.podcast_title} />
                 ) : (
                   <div className="w-full h-full bg-gradient-to-br from-[#a855f7]/40 to-black/20 flex items-center justify-center text-3xl font-bold tracking-widest uppercase">
                     PODCAST
                   </div>
                 )}
              </div>

              {/* Episode Info */}
              <div className="text-center w-full">
                 <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white/95 line-clamp-2">
                   {episode.title}
                 </h1>
                 <p className="text-[#a855f7] font-medium tracking-widest uppercase text-sm mt-3">
                   {episode.podcast_title}
                 </p>
              </div>

              {/* Controls */}
              <div className="w-full flex items-center justify-center gap-8">
                 <button className="text-white/60 hover:text-white transition-colors" onClick={() => skip(-15)}>
                   <SkipBack className="w-8 h-8" />
                 </button>
                 <button 
                   className="w-20 h-20 bg-gradient-to-tr from-[#a855f7] to-[#8b5cf6] text-white rounded-full flex items-center justify-center shadow-lg transform transition-transform hover:scale-105 active:scale-95" 
                   onClick={togglePlay}
                 >
                   {isPlaying ? <Pause className="w-10 h-10 fill-current" /> : <Play className="w-10 h-10 fill-current ml-2" />}
                 </button>
                 <button className="text-white/60 hover:text-white transition-colors" onClick={() => skip(15)}>
                   <SkipForward className="w-8 h-8" />
                 </button>
              </div>

              {/* Progress */}
              <div className="w-full max-w-sm flex items-center gap-4">
                 <span className="text-xs font-medium text-white/50 w-10 text-right">{formatTime(currentTime)}</span>
                 <input 
                   type="range"
                   min="0"
                   max={duration || 100}
                   value={currentTime}
                   onChange={handleSeek}
                   className="flex-1 h-3 rounded-full appearance-none bg-white/10 cursor-pointer accent-[#a855f7]"
                   style={{ background: `linear-gradient(to right, #a855f7 ${(currentTime / (duration || 1)) * 100}%, rgba(255,255,255,0.1) ${(currentTime / (duration || 1)) * 100}%)` }}
                 />
                 <span className="text-xs font-medium text-white/50 w-10">{formatTime(duration)}</span>
              </div>

              {/* Bottom secondary controls */}
              <div className="w-full max-w-sm flex items-center justify-between mt-[-10px] px-4">
                 <button onClick={changeSpeed} className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 text-xs font-semibold tracking-widest transition-colors flex items-center gap-2">
                    <FastForward className="w-3.5 h-3.5" />
                    {playbackRate}x
                 </button>
                 <button onClick={toggleMute} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 text-white/70 transition-colors">
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                 </button>
              </div>

           </div>
        </section>

        {/* Right transcript/description side */}
        <section className="flex-1 flex flex-col border-l border-white/5 bg-[#121212] overflow-hidden lg:max-w-lg w-full">
           <div className="p-6 border-b border-white/5 flex items-center justify-between shadow-sm z-10 relative">
              <h3 className="uppercase tracking-[0.15em] text-[11px] font-bold text-white/50">Transcript</h3>
              <div className="flex gap-4 items-center">
                 {/* Empty tools placeholder */}
              </div>
           </div>
           <div ref={transcriptContainerRef} className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-32">
              {isTranscriptLoading ? (
                 <div className="flex flex-col gap-4">
                    <div className="h-4 bg-white/5 rounded w-3/4 animate-pulse" />
                    <div className="h-4 bg-white/5 rounded w-5/6 animate-pulse" />
                    <div className="h-4 bg-white/5 rounded w-1/2 animate-pulse" />
                 </div>
              ) : transcriptData?.status === 'available' && transcriptData.segments.length > 0 ? (
                 <div className="flex flex-col gap-5 relative">
                   {transcriptData.segments.map((segment) => {
                     const isPast = currentTime * 1000 >= segment.end_ms;
                     const isActive = currentTime * 1000 >= segment.start_ms && currentTime * 1000 < segment.end_ms;
                     return (
                       <div 
                         key={segment.id}
                         ref={isActive ? activeSegmentRef : null}
                         onClick={() => handleTranscriptClick(segment.start_ms)}
                         className={`group flex gap-4 p-3 rounded-xl transition-all cursor-pointer ${isActive ? 'bg-[#a855f7]/10' : 'hover:bg-white/5'}`}
                       >
                         <span className={`text-[10px] font-mono shrink-0 mt-1 ${isActive ? 'text-[#a855f7]' : 'text-white/30 group-hover:text-white/50'}`}>
                           {formatTime(segment.start_ms / 1000)}
                         </span>
                         <p className={`text-[15px] leading-relaxed transition-colors ${isActive ? 'text-white font-medium drop-shadow-sm' : isPast ? 'text-white/40' : 'text-white/70 group-hover:text-white/90'}`}>
                           {segment.text}
                         </p>
                       </div>
                     );
                   })}
                 </div>
              ) : transcriptData?.status === 'pending' ? (
                 <div className="flex flex-col items-center justify-center text-center p-10 h-full gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-[#a855f7]/50" />
                    <div>
                      <p className="text-white/80 font-medium">Processing Audio</p>
                      <p className="text-white/40 text-sm mt-1">Generating subtitles behind the scenes. Check back shortly.</p>
                    </div>
                 </div>
              ) : (
                 <div className="flex flex-col items-start gap-4">
                   <div className="w-12 h-12 bg-white/5 flex items-center justify-center rounded-xl">
                      <span className="text-white/30 text-xs">A/a</span>
                   </div>
                   <div>
                     <p className="text-white/80 font-medium tracking-wide">No Transcript Available</p>
                     <p className="text-white/40 text-[13px] leading-relaxed mt-2 max-w-[80%]">This episode currently lacks a written transcript. Try regenerating it via the admin panel.</p>
                   </div>
                   <div className="w-full mt-6 border-t border-white/5 pt-6">
                     <h4 className="text-xs uppercase tracking-widest text-[#a855f7] mb-3 font-semibold">Description</h4>
                     <div className="prose prose-invert prose-sm max-w-none text-white/50 leading-relaxed font-medium" dangerouslySetInnerHTML={{ __html: episode.description || 'No description available.' }} />
                   </div>
                 </div>
              )}
           </div>
        </section>
      </main>

      <audio ref={audioRef} src={episode.audio_url} preload="metadata" />
    </div>
  );
}
