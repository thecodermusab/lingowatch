import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2,
  RotateCw,
  SlidersHorizontal,
} from "lucide-react";
import { YTChannel, YTVideo, SortMode, MediaTabId, ALL_MEDIA_TABS } from "./mediaTypes";
import { MediaTabs } from "./MediaTabs";
import { SortToggle, ChannelList } from "./MediaSidebar";
import { MediaCard, MediaCardSkeleton } from "./MediaCard";
import { BooksFeed } from "./BooksFeed";
import { PodcastsSidebar } from "./PodcastsSidebar";
import { PodcastsFeed } from "./PodcastsFeed";
import { MyTextsView } from "./MyTextsView";

const VALID_MEDIA_TABS: MediaTabId[] = ALL_MEDIA_TABS.map((tab) => tab.id);
const LOCAL_API_ORIGIN = "http://127.0.0.1:3001";

function getTabFromSearchParams(searchParams: URLSearchParams): MediaTabId | null {
  const requestedTab = searchParams.get("tab");
  return requestedTab && VALID_MEDIA_TABS.includes(requestedTab as MediaTabId)
    ? (requestedTab as MediaTabId)
    : null;
}

async function requestJson<T>(input: string): Promise<T> {
  const response = await fetch(input);
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(error?.error || `HTTP ${response.status}`);
  }
  return response.json();
}

async function apiGet<T>(path: string): Promise<T> {
  try {
    return await requestJson<T>(path);
  } catch (error) {
    const shouldRetryLocalApi =
      path.startsWith("/api/") &&
      (error instanceof TypeError ||
        (error instanceof Error && /failed to fetch|load failed/i.test(error.message)));

    if (shouldRetryLocalApi) {
      return requestJson<T>(`${LOCAL_API_ORIGIN}${path}`);
    }

    throw error;
  }
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-background">
      <div className="rounded-2xl border border-border bg-card/95 px-8 py-10 text-center shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Coming soon</p>
        <p className="mt-3 text-[18px] font-semibold text-foreground">{label}</p>
      </div>
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

function MediaUnavailableState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
      <p className="text-[14px] font-semibold text-foreground">Media is unavailable right now</p>
      <p className="mt-1 max-w-sm text-[12px] leading-6 text-muted-foreground">
        Refresh after the backend reconnects, or try another media tab.
      </p>
    </div>
  );
}

function FeedNotice() {
  return (
    <div className="mx-8 mt-6 rounded-lg border border-warning/35 bg-warning/10 px-4 py-3 text-[12px] leading-5 text-warning">
      Could not refresh the live feed. Showing the available media.
    </div>
  );
}

function VideoFeedLoadingState() {
  return (
    <div className="p-8">
      <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 12 }).map((_, index) => (
          <MediaCardSkeleton key={index} />
        ))}
      </div>
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
      <div className="fixed inset-y-0 left-0 z-50 flex w-screen max-w-none flex-col border-r border-sidebar-border bg-sidebar/98 text-sidebar-foreground shadow-[0_24px_54px_rgba(0,0,0,0.42)] sm:w-[22rem] sm:max-w-[88vw]">
        {children}
      </div>
    </>
  );
}

function FeedRefreshButton({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      aria-label="Refresh videos"
      title="Refresh videos"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/50 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:gap-2 sm:px-3.5"
    >
      <RotateCw className={["h-3.5 w-3.5", refreshing ? "animate-spin" : ""].join(" ")} />
      <span className="hidden sm:inline">Refresh</span>
    </button>
  );
}

function ChannelBanner({
  channel,
  loadedVideoCount,
  onRefresh,
  refreshing,
}: {
  channel: YTChannel;
  loadedVideoCount: number;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const youtubeUrl = channel.channelId
    ? `https://youtube.com/channel/${channel.channelId}`
    : `https://youtube.com/results?search_query=${encodeURIComponent(channel.name)}`;

  return (
    <div className="flex items-center gap-3 px-4 py-3 md:gap-6 md:px-8 md:pb-4 md:pt-8">
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-border bg-secondary shadow-sm md:h-20 md:w-20">
        {channel.thumbnail ? (
          <img src={channel.thumbnail} alt={channel.name} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[16px] font-bold tracking-tight text-foreground md:text-[26px]">{channel.name}</h1>
        <div className="mt-1 flex items-center gap-2 text-[12px] font-medium text-muted-foreground md:mt-1.5 md:text-[13px]">
          {loadedVideoCount > 0 && (
            <>
              <span>{loadedVideoCount} videos loaded</span>
              <span className="hidden sm:inline">•</span>
            </>
          )}
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1 transition-colors hover:text-foreground sm:flex"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-[14px] h-[14px]">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
            View on YouTube
          </a>
        </div>
        {channel.label && channel.label !== "Seeded channel" && (
          <p className="mt-2 hidden text-[13px] text-muted-foreground md:block">{channel.label}</p>
        )}
      </div>
      <FeedRefreshButton onRefresh={onRefresh} refreshing={refreshing} />
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
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hydratedChannelsRef = useRef<Set<string>>(new Set());
  const hydratingChannelsRef = useRef<Set<string>>(new Set());
  const refreshInitialYouTubeLoadRef = useRef(
    typeof performance !== "undefined" &&
      performance.getEntriesByType("navigation").some((entry) => {
        return "type" in entry && entry.type === "reload";
      }),
  );
  const previousActiveTabRef = useRef(activeTab);

  useEffect(() => {
    setChannelsLoading(true);
    setChannelsError(null);

    apiGet<YTChannel[]>("/api/media/youtube/channels")
      .then(setChannels)
      .catch((error) => setChannelsError(error.message))
      .finally(() => setChannelsLoading(false));
  }, []);

  const fetchVideos = useCallback(async (replace = true, options: { refresh?: boolean } = {}) => {
    if (replace) {
      setVideosLoading(true);
      setVideosError(null);
      // For the curated mix (no channel selected), keep old videos visible during refresh
      // so the grid doesn't flash. For a specific channel, clear so fresh content appears.
      const keepVideos = options.refresh && !selectedChannel;
      if (!keepVideos) setVideos([]);
      setNextPageToken(null);
      nextPageTokenRef.current = null;
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
    if (options.refresh) params.set("refresh", "1");

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
    const wasOnYouTube = previousActiveTabRef.current === "youtube";

    if (activeTab === "youtube") {
      const refresh = refreshInitialYouTubeLoadRef.current || !wasOnYouTube;
      refreshInitialYouTubeLoadRef.current = false;
      fetchVideos(true, { refresh });
    }

    previousActiveTabRef.current = activeTab;
  }, [activeTab, fetchVideos]);

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

  const renderChannelList = (showHeading = true) => (
    <>
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
        showHeading={showHeading}
        flush={!showHeading}
        onClose={showHeading ? undefined : () => setMobileSidebarOpen(false)}
      />
      {channelsError ? (
        <p className="border-t border-border px-4 py-3 text-[11px] text-destructive">{channelsError}</p>
      ) : null}
    </>
  );

  const sidebarContent = (
    <>
      <SortToggle value={sort} onChange={setSort} />
      {renderChannelList()}
    </>
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground lg:h-screen lg:min-h-0">
      
      <div className="flex shrink-0 items-center gap-2 border-b border-border/80 bg-background/85 px-3 py-2 backdrop-blur lg:hidden">
        <div className="min-w-0 flex-1">
          <MediaTabs active={activeTab} onChange={handleTabChange} compact />
        </div>
        {activeTab === "youtube" ? (
          <>
            <FeedRefreshButton
              refreshing={videosLoading}
              onRefresh={() => void fetchVideos(true, { refresh: true })}
            />
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3.5 py-2 text-[12px] font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Channels
            </button>
          </>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="hidden shrink-0 border-b border-border bg-background lg:block">
        <MediaTabs active={activeTab} onChange={handleTabChange} />
      </div>

      {/* Tab Content */}
      <div className="flex flex-1 min-h-0 relative">
        
        {activeTab === "books" ? (
          <div className="flex flex-1 min-h-0 overflow-hidden bg-background">
            <BooksFeed />
          </div>
        ) : activeTab === "podcasts" ? (
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-background lg:flex-row">
            <PodcastsSidebar selectedPodcast={selectedPodcast} onSelect={setSelectedPodcast} />
            <PodcastsFeed selectedPodcast={selectedPodcast} />
          </div>
        ) : activeTab === "my_texts" ? (
          <div className="flex flex-1 min-h-0 overflow-hidden bg-background">
            <MyTextsView />
          </div>
        ) : activeTab !== "youtube" ? (
          <div className="flex flex-1 items-center justify-center bg-background">
            <ComingSoon label={activeTab.replace("_", " ")} />
          </div>
      ) : (
          <div className="flex flex-1 min-h-0 overflow-hidden bg-background">
            <aside className="hidden w-[280px] shrink-0 flex-col overflow-y-auto border-r border-border bg-card/95 lg:flex">
              {sidebarContent}
            </aside>

            <section className="flex flex-1 flex-col min-w-0 overflow-y-auto scrollbar-thin scrollbar-thumb-primary/50 scrollbar-track-transparent">
              {selectedChannelRecord && (
                <div className="shrink-0 border-b border-border bg-card/95">
                  <ChannelBanner
                    channel={selectedChannelRecord}
                    loadedVideoCount={videos.length}
                    refreshing={videosLoading}
                    onRefresh={() => void fetchVideos(true, { refresh: true })}
                  />
                </div>
              )}
              {!selectedChannelRecord && (
                <div className="hidden shrink-0 items-center justify-end gap-3 border-b border-border bg-card/95 px-4 py-2.5 md:flex md:px-8 md:py-3">
                  <FeedRefreshButton
                    refreshing={videosLoading}
                    onRefresh={() => void fetchVideos(true, { refresh: true })}
                  />
                </div>
              )}
              
              {videosLoading && videos.length === 0 ? (
                <VideoFeedLoadingState />
              ) : videosError && videos.length === 0 ? (
                <div className="p-8"><MediaUnavailableState /></div>
              ) : videos.length === 0 ? (
                <div className="p-8"><EmptyState channelName={selectedChannelName} /></div>
              ) : (
                <>
                  {videosError ? <FeedNotice /> : null}
                  <div className="p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-x-6 gap-y-10">
                    {videos.map((video) => (
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

                  <div ref={sentinelRef} className="h-5 shrink-0" />

                  {loadingMore && (
                    <div className="flex items-center justify-center py-6 shrink-0">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}

        <MobileSidebarSheet open={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)}>
          {renderChannelList(false)}
        </MobileSidebarSheet>
      </div>
    </div>
  );
}
