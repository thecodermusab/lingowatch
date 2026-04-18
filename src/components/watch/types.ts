export type TranscriptTab = "subtitles";

export interface TranscriptCue {
  id: string;
  start: number;
  end: number;
  text: string;
  translation: string;
}

export interface WatchVideoMeta {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
}
