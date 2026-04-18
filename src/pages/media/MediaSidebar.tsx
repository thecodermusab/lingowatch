import { useEffect, useRef, useState } from "react";
import { Pin, X } from "lucide-react";
import { YTChannel, SortMode } from "./mediaTypes";

interface SortToggleProps {
  value: SortMode;
  onChange: (v: SortMode) => void;
}

export function SortToggle({ value, onChange }: SortToggleProps) {
  return (
    <section className="px-4 pb-4 pt-5">
      <div className="flex rounded-full border border-border bg-secondary/55 p-1">
        {(["date", "viewCount"] as SortMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={[
              "flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[12px] font-semibold transition-colors",
              value === mode
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {mode === "date" ? "Latest" : "Most Viewed"}
          </button>
        ))}
      </div>
    </section>
  );
}

interface ChannelListProps {
  channels: YTChannel[];
  selected: string | null;
  pinned: Set<string>;
  onSelect: (id: string | null) => void;
  onTogglePin: (id: string) => void;
  onHydrateChannel: (channelId: string, seed: string) => void;
  loading: boolean;
  showHeading?: boolean;
  flush?: boolean;
  onClose?: () => void;
}

function YouTubeFallbackIcon() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary/75 shadow-sm">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-6 w-6"
      >
        <path
          fill="#ff0033"
          d="M21.58 7.19a2.65 2.65 0 0 0-1.86-1.88C18.08 4.86 12 4.86 12 4.86s-6.08 0-7.72.45A2.65 2.65 0 0 0 2.42 7.2 27.82 27.82 0 0 0 2 12a27.82 27.82 0 0 0 .42 4.81 2.65 2.65 0 0 0 1.86 1.88c1.64.45 7.72.45 7.72.45s6.08 0 7.72-.45a2.65 2.65 0 0 0 1.86-1.88A27.82 27.82 0 0 0 22 12a27.82 27.82 0 0 0-.42-4.81Z"
        />
        <path fill="#fff" d="M10 15.2V8.8l5.45 3.2L10 15.2Z" />
      </svg>
    </span>
  );
}

function ChannelAvatar({
  channel,
  onHydrateChannel,
}: {
  channel: YTChannel;
  onHydrateChannel: (channelId: string, seed: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(Boolean(channel.thumbnail));
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (channel.thumbnail || !containerRef.current) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "140px" },
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [channel.thumbnail]);

  useEffect(() => {
    if (!visible || channel.thumbnail || channel.id === "__all__") return;
    onHydrateChannel(channel.id, channel.handle || channel.name);
  }, [channel.handle, channel.id, channel.name, channel.thumbnail, onHydrateChannel, visible]);

  if (channel.thumbnail && !imageFailed) {
    return (
      <div ref={containerRef}>
        <img
          src={channel.thumbnail}
          alt={channel.name}
          className="h-9 w-9 shrink-0 rounded-full border border-border object-cover shadow-sm"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
            setImageFailed(true);
          }}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <YouTubeFallbackIcon />
    </div>
  );
}

const ALL_CHANNEL_PLACEHOLDER: YTChannel = {
  id: "__all__",
  handle: "",
  name: "Curated mix",
  label: "",
  thumbnail: "",
  videoCount: 0,
};

export function ChannelList({
  channels,
  selected,
  pinned,
  onSelect,
  onTogglePin,
  onHydrateChannel,
  loading,
  showHeading = true,
  flush = false,
  onClose,
}: ChannelListProps) {
  if (loading) {
    return (
      <div className="flex-1 space-y-2 px-4 py-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 py-1.5">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-secondary/60" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-28 animate-pulse rounded bg-secondary/60" />
              <div className="h-2.5 w-16 animate-pulse rounded bg-secondary/40" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const pinnedChannels = channels.filter((channel) => pinned.has(channel.id));
  const unpinnedChannels = channels.filter((channel) => !pinned.has(channel.id));
  const orderedChannels = [...pinnedChannels, ...unpinnedChannels];
  const totalCount = channels.reduce((sum, channel) => sum + channel.videoCount, 0);

  return (
    <div className={["flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-primary/50 scrollbar-track-transparent", flush ? "px-0 pb-0" : "px-3 pb-5"].join(" ")}>
      {showHeading ? (
        <div className="px-2 pb-2 pt-1">
          <p className="text-[11px] font-semibold tracking-[0.02em] text-muted-foreground">
            Channels
          </p>
        </div>
      ) : null}

      <div className={["overflow-hidden border border-border bg-card/95", flush ? "rounded-none border-x-0 border-t-0" : "rounded-[1.45rem]"].join(" ")}>
        <ChannelRow
          channel={ALL_CHANNEL_PLACEHOLDER}
          isSelected={selected === null}
          isPinned={false}
          onSelect={() => onSelect(null)}
          onTogglePin={() => {}}
          onHydrateChannel={() => {}}
          showPin={false}
          label="All channels"
          count={onClose ? 0 : totalCount}
          action={onClose ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/70 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Close channels"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        />

        {orderedChannels.map((channel) => (
          <ChannelRow
            key={channel.id}
            channel={channel}
            isSelected={selected === channel.id}
            isPinned={pinned.has(channel.id)}
            onSelect={() => onSelect(selected === channel.id ? null : channel.id)}
            onTogglePin={() => onTogglePin(channel.id)}
            onHydrateChannel={onHydrateChannel}
            showPin
            label={channel.name}
            count={channel.videoCount}
          />
        ))}
      </div>
    </div>
  );
}

function ChannelRow({
  channel,
  isSelected,
  isPinned,
  onSelect,
  onTogglePin,
  onHydrateChannel,
  showPin,
  label,
  count,
  action,
}: {
  channel: YTChannel;
  isSelected: boolean;
  isPinned: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onHydrateChannel: (channelId: string, seed: string) => void;
  showPin: boolean;
  label: string;
  count: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="group relative flex cursor-pointer items-center border-b border-border/70 last:border-b-0" onClick={onSelect}>
      <div
        className={[
          "mx-1 my-1 flex min-w-0 flex-1 items-center gap-3 rounded-[1.15rem] px-3 py-2.5 transition-colors",
          isSelected ? "bg-secondary" : "hover:bg-secondary/70",
        ].join(" ")}
      >
        {channel.id === "__all__" ? (
          <YouTubeFallbackIcon />
        ) : (
          <ChannelAvatar channel={channel} onHydrateChannel={onHydrateChannel} />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-foreground">
            {label}
          </p>
        </div>

        {action ? action : count > 0 ? (
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {count}
          </span>
        ) : null}

        {showPin ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin();
            }}
            className={[
              "ml-1 shrink-0 rounded-full p-1 transition-all",
              isPinned
                ? "bg-secondary text-foreground"
                : "text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-foreground",
            ].join(" ")}
            aria-label={isPinned ? "Unpin" : "Pin"}
          >
            <Pin className="h-4 w-4" fill={isPinned ? "currentColor" : "none"} />
          </button>
        ) : action ? null : (
          <div className="w-5 ml-1" />
        )}
      </div>
    </div>
  );
}
