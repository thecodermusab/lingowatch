import { useEffect, useRef, useState } from "react";
import { Pin } from "lucide-react";
import { YTChannel, SortMode } from "./mediaTypes";

interface VocabSliderProps {
  value: [number, number];
  onChange: (v: [number, number]) => void;
}

export function VocabSlider({ value, onChange }: VocabSliderProps) {
  const MIN = 0;
  const MAX = 100000;

  return (
    <section className="px-6 py-5">
      <p className="mb-4 text-[12px] text-white/50">Vocabulary level</p>
      <div className="relative h-1 bg-[#3e3e3e] rounded-full">
        <div
          className="absolute h-full bg-[#a855f7] rounded-full"
          style={{
            left: `${(value[0] / MAX) * 100}%`,
            right: `${100 - (value[1] / MAX) * 100}%`,
          }}
        />
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={100}
          value={value[0]}
          onChange={(e) => {
            const nextValue = parseInt(e.target.value, 10);
            if (nextValue < value[1]) onChange([nextValue, value[1]]);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={100}
          value={value[1]}
          onChange={(e) => {
            const nextValue = parseInt(e.target.value, 10);
            if (nextValue > value[0]) onChange([value[0], nextValue]);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <span
          className="pointer-events-none absolute top-1/2 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#a855f7]"
          style={{ left: `${(value[0] / MAX) * 100}%` }}
        />
        <span
          className="pointer-events-none absolute top-1/2 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#a855f7]"
          style={{ left: `${(value[1] / MAX) * 100}%` }}
        />
      </div>
      <div className="mt-3 flex justify-between text-[12px] text-white">
        <span>0</span>
        <span>400</span>
        <span>2500</span>
        <span>100000</span>
      </div>
    </section>
  );
}

interface SortToggleProps {
  value: SortMode;
  onChange: (v: SortMode) => void;
}

export function SortToggle({ value, onChange }: SortToggleProps) {
  return (
    <section className="px-6 py-2 border-b border-[#3e3e3e]">
      <p className="mb-2 text-[12px] text-white/50">Sort by</p>
      <div className="flex gap-2 pb-5">
        {(["date", "viewCount"] as SortMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={[
              "flex flex-1 items-center justify-center gap-2 rounded py-1.5 text-[14px] transition-colors",
              value === mode
                ? "bg-[#4a4a4a] text-white"
                : "bg-[#2d2d2d] text-white/70 hover:bg-[#3a3a3a] hover:text-white",
            ].join(" ")}
          >
            {mode === "date" ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                Date
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>
                </svg>
                Views
              </>
            )}
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

  if (channel.thumbnail) {
    return (
      <div ref={containerRef}>
        <img
          src={channel.thumbnail}
          alt={channel.name}
          className="h-8 w-8 shrink-0 rounded-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[14px] font-bold text-primary">
        {channel.name.slice(0, 2).toUpperCase()}
      </span>
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
}: ChannelListProps) {
  if (loading) {
    return (
      <div className="flex-1 space-y-2 px-4 py-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 py-1.5">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-28 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-2.5 w-16 animate-pulse rounded bg-white/[0.04]" />
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
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#a855f7] scrollbar-track-transparent pb-6">
      <p className="px-6 pb-2 pt-5 text-[15px] font-medium text-white/90">
        Channel
      </p>

      <ChannelRow
        channel={ALL_CHANNEL_PLACEHOLDER}
        isSelected={selected === null}
        isPinned={false}
        onSelect={() => onSelect(null)}
        onTogglePin={() => {}}
        onHydrateChannel={() => {}}
        showPin={false}
        label="All channels"
        count={totalCount}
      />

      <div className="my-3 border-t border-[#3e3e3e]" />
      
      <div className="flex items-center gap-3 px-6 pb-2 pt-2 text-[10px] uppercase tracking-widest text-[#888888]">
        <div className="h-[1px] w-4 bg-[#3e3e3e]"></div>
        <span>Recommended: 1 - 50</span>
        <div className="h-[1px] flex-1 bg-[#3e3e3e]"></div>
      </div>

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
}) {
  return (
    <div className="relative group mx-0 flex cursor-pointer items-center transition-colors hover:bg-white/5" onClick={onSelect}>
      {isSelected ? (
        <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-[#a855f7]" />
      ) : null}
      
      <div className={["flex flex-1 items-center gap-4 py-2.5 pr-4", isSelected ? "pl-5 bg-white/[0.04]" : "pl-[24px]"].join(' ')}>
        {channel.id === "__all__" ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#5cb8b2] text-[15px] font-bold text-white">
            E
          </span>
        ) : (
          <ChannelAvatar channel={channel} onHydrateChannel={onHydrateChannel} />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-white/90">
            {label}
          </p>
        </div>

        {count > 0 ? (
          <span className="shrink-0 rounded-[4px] bg-[#3e3e3e] px-1.5 py-[1px] text-[12px] font-medium text-white/60">
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
              "ml-1 shrink-0 p-1 transition-all",
              isPinned
                ? "text-[#a855f7]"
                : "text-white/20 opacity-0 group-hover:opacity-100 hover:text-white/50",
            ].join(" ")}
            aria-label={isPinned ? "Unpin" : "Pin"}
          >
            <Pin className="h-4 w-4" fill={isPinned ? "currentColor" : "none"} />
          </button>
        ) : (
          <div className="w-5 ml-1" />
        )}
      </div>
    </div>
  );
}
