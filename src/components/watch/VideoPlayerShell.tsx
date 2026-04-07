import { Pause, Play, Settings, Volume2 } from "lucide-react";
import { TranscriptCue, WatchVideoMeta } from "@/components/watch/types";
import { RefObject } from "react";

interface VideoPlayerShellProps {
  video: WatchVideoMeta;
  cues: TranscriptCue[];
  activeCue: TranscriptCue | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playerReady: boolean;
  translationLoading: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  playerHostRef: RefObject<HTMLDivElement>;
}

function decodeHtml(input: string): string {
  if (typeof window === "undefined") return input;
  const parser = new DOMParser();
  return parser.parseFromString(input, "text/html").documentElement.textContent || input;
}

function formatTime(timeInSeconds: number) {
  if (!Number.isFinite(timeInSeconds) || timeInSeconds < 0) return "0:00";

  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

export function VideoPlayerShell({
  video,
  cues,
  activeCue,
  currentTime,
  duration,
  isPlaying,
  playerReady,
  translationLoading,
  onTogglePlay,
  onSeek,
  playerHostRef,
}: VideoPlayerShellProps) {
  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
  const title = decodeHtml(video.title);
  const channelTitle = decodeHtml(video.channelTitle);
  const activeTranslation = activeCue?.translation || "";

  return (
    <section className="flex min-h-0 flex-col bg-[#191d22]">
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-4 pt-3 lg:px-4">
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-black shadow-[0_20px_50px_rgba(0,0,0,0.32)]">
          <div className="aspect-video w-full bg-[#090a0c]">
            <div ref={playerHostRef} className="h-full w-full" />
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-white/[0.05] bg-[#23272e] px-4 py-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <p className="mx-auto max-w-4xl text-[24px] font-medium leading-[1.48] text-white">
            {activeCue?.text || "Loading subtitles..."}
          </p>
        </div>

        <div className="px-4 py-3 text-center">
          <p className="mx-auto max-w-4xl text-[18px] leading-[1.6] text-white/72">
            {activeTranslation || (translationLoading ? "Translating to Somali. First load can take a few seconds." : "Translation will appear here once transcript lines are available.")}
          </p>
        </div>

        <div className="mt-auto rounded-xl border border-white/[0.06] bg-[#16191e] px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold text-white">{title}</h1>
              <p className="mt-1 text-[12px] text-white/48">{channelTitle}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onTogglePlay}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-[#2d3239] px-3.5 text-[12px] font-semibold text-white transition hover:bg-[#3a414a]"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isPlaying ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#2d3239] text-white/74 transition hover:bg-[#3a414a] hover:text-white"
                aria-label="Volume"
              >
                <Volume2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#2d3239] text-white/74 transition hover:bg-[#3a414a] hover:text-white"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-[11px] text-white/46">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <div className="relative h-1.5 rounded-full bg-white/[0.08]">
              <button
                type="button"
                onClick={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const ratio = Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1);
                  onSeek(ratio * duration);
                }}
                className="absolute inset-0 h-full w-full"
                aria-label="Seek"
              />
              <div className="h-full rounded-full bg-[#8b5cf6]" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
            {cues.slice(0, 12).map((cue) => {
              const isActive = cue.id === activeCue?.id;
              return (
                <button
                  key={cue.id}
                  type="button"
                  onClick={() => onSeek(cue.start)}
                  className={[
                    "shrink-0 rounded-full px-3 py-1.5 text-[11px] transition-colors",
                    isActive
                      ? "bg-[#8b5cf6]/24 text-white"
                      : "bg-white/[0.04] text-white/46 hover:bg-white/[0.07] hover:text-white/74",
                  ].join(" ")}
                >
                  {formatTime(cue.start)}
                </button>
              );
            })}
            {!playerReady ? (
              <span className="shrink-0 rounded-full bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/38">
                Connecting player...
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
