import { HIDDEN_MEDIA_TABS } from "./hidden/mediaHiddenTabs";

export interface YTChannel {
  id: string;
  handle: string;
  name: string;
  label: string;
  thumbnail: string;
  videoCount: number;
  channelId?: string;
}

export interface YTVideo {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  viewCount: number;
  durationSeconds?: number;
  durationMinutes: number;
  vocabScore: number; // 0–50000 approximation of word frequency rank
}

export interface PodcastChannel {
  id: string;
  title: string;
  slug: string;
  publisher: string | null;
  description: string | null;
  artwork_url: string | null;
  last_synced_at: string | null;
}

export interface PodcastEpisode {
  id: string;
  podcast_id: string;
  title: string;
  slug: string;
  description: string | null;
  published_at: string | null;
  duration_seconds: number | null;
  audio_url: string;
  artwork_url: string | null;
  transcript_status: string;
}

export type SortMode = "date" | "viewCount";
export type MediaTabId =
  | "youtube"
  | "netflix"
  | "books"
  | "fsi_dli"
  | "media_file"
  | "podcasts"
  | "my_texts"
  | "resources";

export interface MediaTabDefinition {
  id: MediaTabId;
  label: string;
  available: boolean;
  badge?: string;
}

export const MEDIA_TABS: MediaTabDefinition[] = [
  { id: "youtube", label: "YouTube", available: true },
  { id: "books", label: "Books", available: true },
  { id: "podcasts", label: "Podcasts", available: true },
  { id: "my_texts", label: "My texts", available: true },
];

export const ALL_MEDIA_TABS: MediaTabDefinition[] = [...MEDIA_TABS, ...HIDDEN_MEDIA_TABS];
