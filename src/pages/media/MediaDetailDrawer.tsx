import { X, Eye, Clock, ExternalLink } from "lucide-react";
import { YTVideo } from "./mediaTypes";

function decodeHtml(input: string): string {
  if (typeof window === "undefined") return input;
  const parser = new DOMParser();
  return parser.parseFromString(input, "text/html").documentElement.textContent || input;
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

interface MediaDetailDrawerProps {
  video: YTVideo | null;
  onClose: () => void;
}

export function MediaDetailDrawer({ video, onClose }: MediaDetailDrawerProps) {
  if (!video) return null;

  const thumbnailUrl = video.thumbnail || `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`;
  const youtubeUrl = `https://www.youtube.com/watch?v=${video.id}`;
  const title = decodeHtml(video.title);
  const channelTitle = decodeHtml(video.channelTitle);
  const description = decodeHtml(video.description);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />

      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-hidden border-l border-white/[0.08] bg-[#111318] shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-[12px] text-white/40 transition-colors hover:text-white/70"
          >
            <X className="h-3.5 w-3.5" />
            Close
          </button>
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-md border border-white/[0.08] px-3 py-1.5 text-[11px] font-medium text-white/50 transition-colors hover:border-white/[0.2] hover:text-white/80"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
            Open on YouTube
          </a>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Thumbnail */}
          <div className="relative aspect-video w-full bg-black">
            <img src={thumbnailUrl} alt={title} className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center">
              <a
                href={youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm transition-transform hover:scale-105"
              >
                <svg viewBox="0 0 24 24" fill="white" className="h-7 w-7 translate-x-0.5">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </a>
            </div>
          </div>

          <div className="px-5 py-5">
            <p className="text-[11px] text-white/40">{channelTitle}</p>
            <h2 className="mt-1.5 text-[15px] font-semibold leading-snug text-white">
              {title}
            </h2>

            {/* Stats row */}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-white/40">
              <span className="flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                {formatViews(video.viewCount)} views
              </span>
              {video.durationMinutes > 0 && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {video.durationMinutes} min
                </span>
              )}
              {video.publishedAt && (
                <span>{formatDate(video.publishedAt)}</span>
              )}
            </div>

            {/* Vocab score */}
            <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
                Vocabulary level
              </p>
              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#6b49db] to-[#a78ef0]"
                    style={{ width: `${Math.min(100, (video.vocabScore / 50000) * 100)}%` }}
                  />
                </div>
                <span className="shrink-0 text-[12px] font-medium text-white/50">
                  #{video.vocabScore.toLocaleString()}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-white/30">
                Lower rank = more common vocabulary = easier to understand
              </p>
            </div>

            {/* Description */}
            {description && (
              <div className="mt-4">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
                  Description
                </p>
                <p className="text-[12px] leading-relaxed text-white/50">{description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="shrink-0 border-t border-white/[0.07] px-5 py-4">
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#6b49db] py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#5c3ec7]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M8 5v14l11-7z" />
            </svg>
            Watch & Study
          </a>
        </div>
      </aside>
    </>
  );
}
