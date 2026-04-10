import { useEffect, useRef, useState } from "react";
import { Pin } from "lucide-react";
import { YTChannel, SortMode } from "./mediaTypes";

interface VocabSliderProps {
  value: [number, number];
  onChange: (v: [number, number]) => void;
}

export function VocabSlider({ value, onChange }: VocabSliderProps) {
  const levels = [
    { id: "all", label: "All Levels", range: [0, 100000] as [number, number] },
    { id: "beginner", label: "Beginner", range: [0, 1500] as [number, number] },
    { id: "intermediate", label: "Intermediate", range: [1500, 5000] as [number, number] },
    { id: "advanced", label: "Advanced", range: [5000, 100000] as [number, number] },
  ];

  const activeLevel = levels.find(l => l.range[0] === value[0] && l.range[1] === value[1])?.id || "custom";

  return (
    <section className="px-6 py-6 border-b border-[#3e3e3e]/30">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">Difficulty</p>
      <div className="flex flex-col gap-1.5">
        {levels.map(level => (
          <button
            key={level.id}
            onClick={() => onChange(level.range)}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
              activeLevel === level.id 
                ? "bg-[#a855f7]/10 text-[#d8b4fe]" 
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            {level.label}
          </button>
        ))}
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
    <section className="px-6 py-6 border-b border-[#3e3e3e]/30">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">Sort by</p>
      <div className="flex rounded-lg bg-[#141414] p-[3px] border border-[#3e3e3e]">
        {(["date", "viewCount"] as SortMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={[
              "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium transition-colors",
              value === mode
                ? "bg-[#2d2d2d] text-white shadow-sm"
                : "text-white/40 hover:text-white/80",
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
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#a855f7] scrollbar-track-transparent">
      <p className="px-6 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">
        Channels
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

      <div className="my-2 border-t border-[#3e3e3e]" />

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
