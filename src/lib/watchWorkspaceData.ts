import { SavedPhrase, TranscriptCue, WordInsight } from "@/components/watch/types";

export const transcriptCues: TranscriptCue[] = [
  {
    id: "cue-1",
    start: 0,
    end: 4.5,
    text: "When you study through real videos, your listening improves before you notice it.",
    translation: "Real videolarla calisinca dinleme becerin yavas yavas guclenir.",
  },
  {
    id: "cue-2",
    start: 4.5,
    end: 8.8,
    text: "The trick is keeping every subtitle line visible exactly when your brain needs it.",
    translation: "Puf noktasi, altyazi satirini beynin ihtiyac duydugu anda gostermek.",
  },
  {
    id: "cue-3",
    start: 8.8,
    end: 12.9,
    text: "That is why dense transcript tools feel faster than ordinary flashcard workflows.",
    translation: "Bu yuzden yogun transkript araclari klasik kart sistemlerinden daha hizli hissettirir.",
  },
  {
    id: "cue-4",
    start: 12.9,
    end: 17.1,
    text: "You can pause, inspect a phrase, replay the line, and return to the video without context switching.",
    translation: "Durup ifadeyi inceleyebilir, satiri tekrar oynatabilir ve baglami kaybetmeden videoya donebilirsin.",
  },
  {
    id: "cue-5",
    start: 17.1,
    end: 20.8,
    text: "Notice how the transcript stays compact so the video still dominates the screen.",
    translation: "Transkriptin kompakt kalmasina dikkat et; ekranin odagi hala video olmali.",
  },
  {
    id: "cue-6",
    start: 20.8,
    end: 25.3,
    text: "Each row acts like a utility strip, not a content card or a lesson block.",
    translation: "Her satir, bir ders kartindan cok hizli kullanim seridi gibi davranir.",
  },
  {
    id: "cue-7",
    start: 25.3,
    end: 29.5,
    text: "Small controls matter here because the interface should stay quiet around the media.",
    translation: "Kucuk kontroller onemli; arayuz medyanin etrafinda sakin kalmali.",
  },
  {
    id: "cue-8",
    start: 29.5,
    end: 33.8,
    text: "The subtitle block sits low, centered, and readable without feeling decorative.",
    translation: "Altyazi blogu asagida, merkezde ve suslu durmadan okunakli olmali.",
  },
  {
    id: "cue-9",
    start: 33.8,
    end: 38,
    text: "Once the rhythm is right, the whole page starts to feel like an analysis console.",
    translation: "Ritim oturunca tum sayfa bir analiz konsolu gibi hissettirir.",
  },
  {
    id: "cue-10",
    start: 38,
    end: 42.5,
    text: "That is the difference between a watch page and a real video learning workspace.",
    translation: "Iste izleme sayfasi ile gercek bir video-ogrenme alani arasindaki fark budur.",
  },
];

export const wordInsights: WordInsight[] = [
  { term: "context switching", meaning: "changing tasks and mental focus", level: "C1", count: 2 },
  { term: "dominates", meaning: "takes visual priority", level: "B2", count: 1 },
  { term: "utility strip", meaning: "compact functional row", level: "C1", count: 3 },
  { term: "compact", meaning: "dense and space-efficient", level: "B1", count: 4 },
  { term: "rhythm", meaning: "timing and pacing", level: "B2", count: 2 },
];

export const savedPhrases: SavedPhrase[] = [
  { term: "quiet around the media", note: "good phrasing for product UX", timestamp: "00:27" },
  { term: "analysis console", note: "strong metaphor for the page concept", timestamp: "00:35" },
  { term: "subtitle block", note: "keep centered and low", timestamp: "00:31" },
];
