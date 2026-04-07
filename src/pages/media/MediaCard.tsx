import { YTVideo } from "./mediaTypes";

function decodeHtml(input: string): string {
  if (typeof window === "undefined") return input;
  const parser = new DOMParser();
  return parser.parseFromString(input, "text/html").documentElement.textContent || input;
}

function formatViews(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(".0", "")}M views`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}K views`;
  return `${count} views`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = diff / 1000;

  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours ago`;
  if (seconds < 2592000) return `${Math.round(seconds / 86400)} days ago`;
  if (seconds < 31536000) return `${Math.round(seconds / 2592000)} months ago`;
  return `${Math.round(seconds / 31536000)} years ago`;
}

function vocabBarFill(score: number): number {
  return Math.min(100, Math.round((score / 50000) * 100));
}

function formatDuration(video: YTVideo): string | null {
  if (video.durationSeconds) {
    const totalSeconds = video.durationSeconds;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    return `${minutes}m ${seconds}s`;
  }
  const minutes = video.durationMinutes;
  if (minutes <= 0) return null;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
}

function VocabBar({ score }: { score: number }) {
  const fill = vocabBarFill(score);

  return (
    <div className="flex items-center gap-2.5">
      <div className="h-[3px] w-24 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary via-primary/80 to-accent"
          style={{ width: `${fill}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground">#{score.toLocaleString()}</span>
    </div>
  );
}

export function MediaCardSkeleton() {
  return (
    <div className="flex gap-4 border-b border-[#3e3e3e] px-6 py-4 bg-[#26272b]">
      <div className="h-[101px] w-[180px] shrink-0 animate-pulse rounded-lg bg-[#3e3e3e]" />
      <div className="flex-1 space-y-3 py-1">
        <div className="h-4 w-3/4 animate-pulse rounded bg-[#3e3e3e]" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[#3e3e3e]/70" />
        <div className="h-3 w-24 animate-pulse rounded bg-[#3e3e3e]/70" />
      </div>
    </div>
  );
}

interface MediaCardProps {
  video: YTVideo;
  onClick: () => void;
}

export function MediaCard({ video, onClick }: MediaCardProps) {
  const thumbnailUrl = video.thumbnail || `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`;
  const duration = formatDuration(video);
  const title = decodeHtml(video.title);
  const channelTitle = decodeHtml(video.channelTitle);

  return (
    <article
      onClick={onClick}
      className="group flex cursor-pointer gap-4 border-b border-[#3e3e3e] px-6 py-4 transition-colors hover:bg-white/[0.04] bg-[#26272b]"
    >
      <div className="relative h-[101px] w-[180px] shrink-0 overflow-hidden rounded-lg bg-[#3e3e3e]">
        <img
          src={thumbnailUrl}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
        />
        {duration ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {duration}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
        <div>
          <h3 className="line-clamp-2 text-[15px] font-medium leading-snug text-white/90">
            {title}
          </h3>
          <p className="mt-1.5 line-clamp-1 text-[13px] text-white/60">
            {formatViews(video.viewCount)}
            {video.publishedAt ? ` • ${timeAgo(video.publishedAt)} • ` : " • "}
            {channelTitle}
          </p>
        </div>
        <VocabBar score={video.vocabScore} />
      </div>
    </article>
  );
}
