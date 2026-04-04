import { Pause, Play, ThumbsDown, ThumbsUp, Bookmark, Share2, Scissors } from "lucide-react";
import { TranscriptCue } from "@/components/watch/types";
import { SubtitleOverlay } from "@/components/watch/SubtitleOverlay";
import { FloatingPlayerControls } from "@/components/watch/FloatingPlayerControls";
import { cn } from "@/lib/utils";

interface VideoPlayerShellProps {
  cues: TranscriptCue[];
  activeCue: TranscriptCue | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  autoPause: boolean;
  onTogglePlay: () => void;
  onToggleAutoPause: () => void;
}

function formatTime(timeInSeconds: number) {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

const lowerActions = [
  { icon: ThumbsUp, label: "20K" },
  { icon: ThumbsDown, label: "" },
  { icon: Share2, label: "Share" },
  { icon: Bookmark, label: "Save" },
  { icon: Scissors, label: "Clip" },
];

export function VideoPlayerShell({
  cues,
  activeCue,
  currentTime,
  duration,
  isPlaying,
  autoPause,
  onTogglePlay,
  onToggleAutoPause,
}: VideoPlayerShellProps) {
  const progress = Math.min((currentTime / duration) * 100, 100);
  const activeIndex = activeCue ? cues.findIndex((cue) => cue.id === activeCue.id) : -1;
  const upcomingCue = activeIndex >= 0 ? cues[activeIndex + 1] ?? null : cues[0] ?? null;

  return (
    <section className="flex min-h-0 flex-col bg-[#0f1012]">
      <div className="relative isolate overflow-hidden border-b border-white/7 bg-[#0b0c0f]">
        <div className="aspect-video w-full">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_46%,rgba(255,255,255,0.18),transparent_18%),radial-gradient(circle_at_52%_52%,rgba(116,111,255,0.42),transparent_34%),radial-gradient(circle_at_68%_38%,rgba(47,43,190,0.5),transparent_28%),linear-gradient(180deg,#1c1830_0%,#3f31a5_28%,#2d2e72_66%,#131318_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.34)_0%,rgba(0,0,0,0.06)_36%,rgba(0,0,0,0.44)_100%)]" />
          <div className="absolute inset-x-[16%] bottom-[18%] top-[22%] rounded-[45%] bg-[radial-gradient(circle_at_50%_34%,rgba(255,235,229,0.92),rgba(211,189,196,0.72)_32%,rgba(82,71,109,0.18)_62%,transparent_66%)] blur-[2px] opacity-95" />
          <div className="absolute left-[12%] top-[16%] h-[54%] w-[24%] rounded-[2px] bg-white/24 blur-[10px]" />
          <div className="absolute right-[14%] top-[20%] h-[38%] w-[16%] rounded-full bg-[#2d3fe0]/30 blur-[36px]" />

          <FloatingPlayerControls autoPause={autoPause} onToggleAutoPause={onToggleAutoPause} />
          <SubtitleOverlay activeCue={activeCue} upcomingCue={upcomingCue} />

          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
            <div className="h-full bg-[#a8adff]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="border-b border-white/7 bg-[#0d0e11] px-4 py-3 lg:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-white">
              I rebuilt the watch page to feel like a subtitle workstation instead of a dashboard.
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-white/58">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#2b2d34] text-[11px] font-semibold text-white/84">
                  L
                </span>
                <div>
                  <p className="font-semibold text-white/84">Lingowatch Studio</p>
                  <p className="text-[11px] text-white/40">32.4K subscribers</p>
                </div>
              </div>
              <button className="rounded-full bg-[#2a2c31] px-3 py-1.5 text-[11px] font-semibold text-white/88 transition hover:bg-[#353840]">
                Join
              </button>
              <button className="rounded-full bg-[#f1f1f1] px-3 py-1.5 text-[11px] font-semibold text-[#111214] transition hover:bg-white">
                Subscribe
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onTogglePlay}
              className="inline-flex h-8 items-center gap-2 rounded-full bg-[#202228] px-3 text-[11px] font-semibold text-white/86 transition hover:bg-[#292c33]"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isPlaying ? "Pause" : "Play"}
            </button>
            {lowerActions.map(({ icon: Icon, label }, index) => (
              <button
                key={index}
                type="button"
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-full bg-[#202228] px-3 text-[11px] font-semibold text-white/80 transition hover:bg-[#292c33]",
                  !label && "w-8 justify-center px-0"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label ? <span>{label}</span> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.12em] text-white/34">
          <span>{formatTime(currentTime)} elapsed</span>
          <span className="h-[3px] w-[3px] rounded-full bg-white/16" />
          <span>{formatTime(duration)} total</span>
        </div>
      </div>
    </section>
  );
}
