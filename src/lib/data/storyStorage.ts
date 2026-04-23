import { TtsWordTiming } from "@/lib/audio/tts";
import { PhraseAudioAsset } from "@/types";
import { accountStorageKey, legacyOwnerEmail, normalizeOwnerEmail } from "@/lib/auth/accountStorage";

export interface StoryEntry {
  id: string;
  title: string;
  words: string[];
  content: string;
  createdAt: string;
  audio?: PhraseAudioAsset;
  wordTimings?: TtsWordTiming[];
  playbackState?: {
    currentTime: number;
    updatedAt: string;
  };
}

export function loadStoredStories(userEmail?: string | null): StoryEntry[] {
  const normalizedEmail = normalizeOwnerEmail(userEmail);
  const storageKey = accountStorageKey("lingowatch_stories", normalizedEmail);
  let raw = localStorage.getItem(storageKey);

  if (!raw && normalizedEmail === legacyOwnerEmail()) {
    raw = localStorage.getItem("lingowatch_stories");
    if (raw) localStorage.setItem(storageKey, raw);
  }

  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredStories(stories: StoryEntry[], userEmail?: string | null) {
  const normalizedEmail = normalizeOwnerEmail(userEmail);
  localStorage.setItem(accountStorageKey("lingowatch_stories", normalizedEmail), JSON.stringify(stories));
}
