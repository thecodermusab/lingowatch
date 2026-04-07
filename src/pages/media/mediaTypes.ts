export interface YTChannel {
  id: string;
  handle: string;
  name: string;
  label: string;
  thumbnail: string;
  videoCount: number;
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

export const MEDIA_TABS: Array<{ id: MediaTabId; label: string; available: boolean; badge?: string }> = [
  { id: "youtube", label: "YouTube", available: true },
  { id: "netflix", label: "Netflix", available: false },
  { id: "books", label: "Books", available: true },
  { id: "fsi_dli", label: "FSI/DLI", available: false },
  { id: "media_file", label: "Media file", available: false, badge: "NEW" },
  { id: "podcasts", label: "Podcasts", available: false },
  { id: "my_texts", label: "My texts", available: false },
  { id: "resources", label: "Resources", available: false },
];
