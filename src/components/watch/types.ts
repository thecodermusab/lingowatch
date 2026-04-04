export type TranscriptTab = "subtitles" | "words" | "saved";

export interface TranscriptCue {
  id: string;
  start: number;
  end: number;
  text: string;
  translation: string;
}

export interface WordInsight {
  term: string;
  meaning: string;
  level: "A2" | "B1" | "B2" | "C1";
  count: number;
}

export interface SavedPhrase {
  term: string;
  note: string;
  timestamp: string;
}
