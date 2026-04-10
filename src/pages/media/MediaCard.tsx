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

export function MediaCardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-video w-full animate-pulse rounded-xl bg-[#2d2d2d]" />
      <div className="space-y-2.5">
        <div className="h-4 w-[90%] animate-pulse rounded bg-[#2d2d2d]" />
        <div className="h-3 w-[60%] animate-pulse rounded bg-[#2d2d2d]" />
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
      className="group flex flex-col cursor-pointer transition-all hover:-translate-y-1"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#2d2d2d] shadow-sm">
        <img
          src={thumbnailUrl}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        {duration ? (
          <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {duration}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col mt-3">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-tight text-white/95 group-hover:text-white transition-colors">
          {title}
        </h3>
        <p className="mt-1 text-[13px] text-white/50 line-clamp-1">
          {channelTitle}
        </p>
        <p className="text-[12px] text-white/40 mt-0.5">
          {formatViews(video.viewCount)}
          {video.publishedAt ? ` • ${timeAgo(video.publishedAt)}` : ""}
        </p>
      </div>
    </article>
  );
}
