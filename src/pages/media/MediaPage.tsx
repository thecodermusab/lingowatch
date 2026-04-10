import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  Loader2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { YTChannel, YTVideo, SortMode, MediaTabId, ALL_MEDIA_TABS } from "./mediaTypes";
import { MediaTabs } from "./MediaTabs";
import { VocabSlider, SortToggle, ChannelList } from "./MediaSidebar";
import { MediaCard, MediaCardSkeleton } from "./MediaCard";
import { BooksFeed } from "./BooksFeed";
import { PodcastsSidebar } from "./PodcastsSidebar";
import { PodcastsFeed } from "./PodcastsFeed";
import { MyTextsView } from "./MyTextsView";

const VALID_MEDIA_TABS: MediaTabId[] = ALL_MEDIA_TABS.map((tab) => tab.id);

function getTabFromSearchParams(searchParams: URLSearchParams): MediaTabId | null {
  const requestedTab = searchParams.get("tab");
  return requestedTab && VALID_MEDIA_TABS.includes(requestedTab as MediaTabId)
    ? (requestedTab as MediaTabId)
    : null;
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || `HTTP ${response.status}`);
  }
  return response.json();
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-background">
      <div className="rounded-2xl border border-border bg-card px-8 py-10 text-center shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Coming soon</p>
        <p className="mt-3 text-[18px] font-semibold text-foreground">{label}</p>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  const isApiKeyError = message.includes("YOUTUBE_API_KEY");
  const isQuotaError = /quota/i.test(message);
  const title = isApiKeyError
    ? "YouTube API key not configured"
    : isQuotaError
      ? "YouTube quota reached"
      : "Failed to load the media feed";
  const detail = isApiKeyError
    ? "Add your YOUTUBE_API_KEY to .env or .env.local, then restart the backend so the curated channel feed can load."
    : isQuotaError
      ? "This project has used up its YouTube Data API daily quota. Wait for the quota reset at midnight Pacific Time, or reduce search-heavy requests on the media page."
      : message;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
      <AlertCircle className="mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-[14px] font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-[12px] leading-6 text-muted-foreground">{detail}</p>
      {isQuotaError ? (
        <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[11px] leading-5 text-amber-200">
          The current media feed relies on YouTube discovery requests, which consume quota quickly.
        </p>
      ) : null}
      {isApiKeyError ? (
        <code className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[11px] text-white/48">
          YOUTUBE_API_KEY=your_key_here
        </code>
      ) : null}
    </div>
  );
}

function EmptyState({ channelName }: { channelName: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
      <p className="text-[14px] font-semibold text-foreground">No videos found for {channelName}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Try a different channel or widen the vocabulary range.
      </p>
    </div>
  );
}

function MobileSidebarSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/68" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-y-0 left-0 z-50 flex w-[18.5rem] max-w-[88vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[0_24px_54px_rgba(0,0,0,0.42)]">
        <div className="flex shrink-0 items-center justify-between border-b border-sidebar-border px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Channels & Filters</p>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

function ChannelBanner({ channel, loadedVideoCount }: { channel: YTChannel; loadedVideoCount: number }) {
  const youtubeUrl = channel.channelId
    ? `https://youtube.com/channel/${channel.channelId}`
    : `https://youtube.com/results?search_query=${encodeURIComponent(channel.name)}`;

  return (
    <div className="px-8 pb-4 pt-8 flex flex-col md:flex-row items-start md:items-center gap-6">
      <div className="h-20 w-20 shrink-0 rounded-full overflow-hidden bg-[#2d2d2d] border border-white/5 shadow-sm">
        {channel.thumbnail ? (
          <img src={channel.thumbnail} alt={channel.name} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-[26px] font-bold text-white/95 tracking-tight">{channel.name}</h1>
        <div className="flex items-center gap-2 mt-1.5 text-[13px] font-medium text-white/40">
          {loadedVideoCount > 0 && (
            <>
              <span>{loadedVideoCount} videos loaded</span>
              <span>•</span>
            </>
          )}
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 hover:text-white/80 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-[14px] h-[14px]">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
            View on YouTube
          </a>
        </div>
        {channel.label && channel.label !== "Seeded channel" && (
          <p className="mt-2 text-[13px] text-white/40">{channel.label}</p>
        )}
      </div>
    </div>
  );
}

export default function MediaPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<MediaTabId>(() => {
    const requestedTab = getTabFromSearchParams(searchParams);
    if (requestedTab) return requestedTab;
    return (localStorage.getItem("lingowatch_media_tab") as MediaTabId) || "youtube";
  });

  useEffect(() => {
    localStorage.setItem("lingowatch_media_tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    const requestedTab = getTabFromSearchParams(searchParams);
    if (requestedTab && requestedTab !== activeTab) {
      setActiveTab(requestedTab);
    }
  }, [searchParams]);

  const handleTabChange = useCallback((nextTab: MediaTabId) => {
    setActiveTab(nextTab);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", nextTab);
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const [channels, setChannels] = useState<YTChannel[]>([]);
  const channelsRef = useRef<YTChannel[]>([]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [videos, setVideos] = useState<YTVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const nextPageTokenRef = useRef<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [selectedPodcast, setSelectedPodcast] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("date");
  const [vocabRange, setVocabRange] = useState<[number, number]>([0, 100000]);
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hydratedChannelsRef = useRef<Set<string>>(new Set());
  const hydratingChannelsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setChannelsLoading(true);
    setChannelsError(null);

    apiGet<YTChannel[]>("/api/media/youtube/channels")
      .then(setChannels)
      .catch((error) => setChannelsError(error.message))
      .finally(() => setChannelsLoading(false));
  }, []);

  const fetchVideos = useCallback(async (replace = true) => {
    if (replace) {
      setVideosLoading(true);
      setVideosError(null);
    } else {
      setLoadingMore(true);
    }

    const params = new URLSearchParams({ sort });
    const selectedChannelRecord = selectedChannel
      ? channelsRef.current.find((channel) => channel.id === selectedChannel) ?? null
      : null;

    if (selectedChannelRecord) {
      if (selectedChannelRecord.id.startsWith("seed:")) {
        params.set("channelSeed", selectedChannelRecord.handle || selectedChannelRecord.name);
      } else {
        params.set("channelId", selectedChannelRecord.id);
      }
    }
    if (!replace && nextPageTokenRef.current) params.set("pageToken", nextPageTokenRef.current);

    try {
      const data = await apiGet<{ videos: YTVideo[]; nextPageToken: string | null }>(
        `/api/media/youtube/videos?${params}`,
      );

      setVideos((previous) => (replace ? data.videos : [...previous, ...data.videos]));
      nextPageTokenRef.current = data.nextPageToken;
      setNextPageToken(data.nextPageToken);

      // Update the selected channel's videoCount so the sidebar badge reflects reality
      if (selectedChannel) {
        setChannels((previous) =>
          previous.map((ch) =>
            ch.id === selectedChannel
              ? { ...ch, videoCount: replace ? data.videos.length : ch.videoCount + data.videos.length }
              : ch
          )
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (replace) setVideosError(message);
    } finally {
      setVideosLoading(false);
      setLoadingMore(false);
    }
  }, [selectedChannel, sort]);

  useEffect(() => {
    if (activeTab === "youtube") fetchVideos(true);
  }, [activeTab, selectedChannel, sort]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && nextPageTokenRef.current && !loadingMore && !videosLoading) {
          fetchVideos(false);
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchVideos, loadingMore, videosLoading]);

  const filteredVideos = videos.filter(
    (video) => video.vocabScore >= vocabRange[0] && video.vocabScore <= vocabRange[1],
  );

  const selectedChannelRecord = selectedChannel
    ? channels.find((channel) => channel.id === selectedChannel) ?? null
    : null;
  const selectedChannelName = selectedChannelRecord?.name ?? "Curated mix";

  const togglePin = (channelId: string) => {
    setPinned((previous) => {
      const next = new Set(previous);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      return next;
    });
  };

  const hydrateChannel = useCallback(async (channelId: string, seed: string) => {
    if (!seed) return;
    if (hydratedChannelsRef.current.has(channelId) || hydratingChannelsRef.current.has(channelId)) return;

    hydratingChannelsRef.current.add(channelId);
    try {
      const data = await apiGet<{ channelId?: string; name?: string; thumbnail?: string }>(
        `/api/media/youtube/channel-seed?seed=${encodeURIComponent(seed)}`,
      );

      setChannels((previous) => previous.map((channel) => {
        if (channel.id !== channelId) return channel;
        return {
          ...channel,
          thumbnail: data.thumbnail || channel.thumbnail,
          name: data.name || channel.name,
        };
      }));
      hydratedChannelsRef.current.add(channelId);
    } catch {
      hydratedChannelsRef.current.add(channelId);
    } finally {
      hydratingChannelsRef.current.delete(channelId);
    }
  }, []);

  const sidebarContent = (
    <>
      <VocabSlider value={vocabRange} onChange={setVocabRange} />
      <SortToggle value={sort} onChange={setSort} />
      <ChannelList
        channels={channels}
        selected={selectedChannel}
        pinned={pinned}
        onSelect={(channelId) => {
          setSelectedChannel(channelId);
          setMobileSidebarOpen(false);
        }}
        onTogglePin={togglePin}
        onHydrateChannel={hydrateChannel}
        loading={channelsLoading}
      />
      {channelsError ? (
        <p className="border-t border-white/[0.06] px-4 py-3 text-[11px] text-rose-300/72">{channelsError}</p>
      ) : null}
    </>
  );

  return (
    <div className="flex min-h-full bg-[#26272b] text-foreground lg:h-screen lg:overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col bg-[#26272b]">
        <div className="flex items-center justify-between border-b border-border bg-background px-4 py-3 lg:hidden">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <img src="/logo-mark.svg" alt="Lingowatch" className="h-8 w-8 rounded-xl bg-white/5 p-1.5" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Lingowatch</p>
              <p className="text-[16px] text-foreground" style={{ fontFamily: "Qurova, sans-serif", fontWeight: 600 }}>
                Reactor
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-[11px] font-medium text-muted-foreground"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Channels
          </button>
        </div>

        <div className="shrink-0 bg-[#26272b]">
          <MediaTabs active={activeTab} onChange={handleTabChange} />
        </div>

        {activeTab === "books" ? (
          <div className="flex min-h-0 flex-1 overflow-hidden relative">
            <BooksFeed />
          </div>
        ) : activeTab === "podcasts" ? (
          <div className="flex min-h-0 flex-1 overflow-hidden relative">
            <PodcastsSidebar selectedPodcast={selectedPodcast} onSelect={setSelectedPodcast} />
            <PodcastsFeed selectedPodcast={selectedPodcast} />
          </div>
        ) : activeTab === "my_texts" ? (
          <div className="flex min-h-0 flex-1 overflow-y-auto">
            <MyTextsView />
          </div>
        ) : activeTab !== "youtube" ? (
          <ComingSoon label={activeTab.replace("_", " ")} />
        ) : (
          <div className="flex min-h-0 flex-1 overflow-hidden relative">
            <aside className="hidden w-[280px] shrink-0 flex-col overflow-hidden border-r border-[#3e3e3e] bg-[#222222] md:flex">
              {sidebarContent}
            </aside>

            <section className="flex min-w-0 flex-1 flex-col bg-[#1a1a1a]">
              <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#a855f7] scrollbar-track-transparent">
                {selectedChannelRecord ? (
                  <ChannelBanner channel={selectedChannelRecord} loadedVideoCount={videos.length} />
                ) : (
                  <div className="md:hidden flex justify-end px-6 py-4 border-b border-[#3e3e3e]/30">
                    <button
                      type="button"
                      onClick={() => setMobileSidebarOpen(true)}
                      className="flex items-center gap-2 rounded-md bg-[#2d2d2d] px-3 py-2 text-[12px] font-medium text-white/80"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Filters
                    </button>
                  </div>
                )}
                {videosError ? (
                  <ErrorState message={videosError} />
                ) : videosLoading ? (
                  <div className="p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-6 gap-y-10">
                    {Array.from({ length: 12 }).map((_, index) => (
                      <MediaCardSkeleton key={index} />
                    ))}
                  </div>
                ) : filteredVideos.length === 0 ? (
                  <EmptyState channelName={selectedChannelName} />
                ) : (
                  <>
                    <div className="p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-6 gap-y-10">
                      {filteredVideos.map((video) => (
                        <MediaCard
                          key={video.id}
                          video={video}
                          onClick={() => {
                            const params = new URLSearchParams({
                              v: video.id,
                              title: video.title,
                              channel: video.channelTitle,
                              thumb: video.thumbnail,
                            });
                            navigate(`/watch?${params.toString()}`);
                          }}
                        />
                      ))}
                    </div>

                    <div ref={sentinelRef} className="h-5" />

                    {loadingMore ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-white/30" />
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </section>
          </div>
        )}

        <MobileSidebarSheet open={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)}>
          {sidebarContent}
        </MobileSidebarSheet>
      </div>
    </div>
  );
}
