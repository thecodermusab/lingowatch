export type PhraseType = "word" | "phrase" | "phrasal_verb" | "idiom" | "expression";
export type DifficultyLevel = "beginner" | "intermediate" | "advanced";
export type ExampleType = "simple" | "daily" | "work" | "extra" | "somali";
export type ReviewRating = "again" | "hard" | "good" | "easy";
export type PreferredAiProvider = "auto" | "glm4" | "deepseek" | "gemini-lite" | "gemini" | "grok" | "openrouter" | "cerebras" | "antigravity";
export type PhraseAudioStatus = "pending" | "ready" | "error";
export type PhraseAudioPrepState = "idle" | "preparing" | "ready" | "partial" | "error";

export interface PhraseAudioAsset {
  text: string;
  audioUrl?: string;
  playbackUrl?: string;
  audioStatus?: PhraseAudioStatus;
  voice?: string;
  language?: string;
  ttsHash?: string;
}

export interface PhraseAudioPrepProgress {
  phraseId: string;
  total: number;
  ready: number;
  pending: number;
  error: number;
  mainReady: boolean;
  exampleTotal: number;
  exampleReady: number;
  state: PhraseAudioPrepState;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  pictureUrl?: string;
  preferredLanguage: string;
  englishLevel: DifficultyLevel;
  somaliModeEnabled: boolean;
  autoPlayAudioEnabled: boolean;
  preferredAiProvider: PreferredAiProvider;
  createdAt: string;
}

export interface Phrase {
  id: string;
  phraseText: string;
  phraseType: PhraseType;
  category: string;
  notes: string;
  isFavorite: boolean;
  isLearned: boolean;
  tags: string[];
  difficultyLevel: DifficultyLevel;
  sourceContext?: string;
  createdAt: string;
  updatedAt: string;
  audioUrl?: string;
  audio?: PhraseAudioAsset;
  explanation?: PhraseExplanation;
  examples?: PhraseExample[];
  review?: ReviewData;
}

export interface PhraseExplanation {
  id: string;
  phraseId: string;
  standardMeaning: string;
  easyMeaning: string;
  aiExplanation: string;
  usageContext: string;
  somaliMeaning: string;
  partOfSpeech?: string;
  somaliExplanation: string;
  somaliSentence: string;
  somaliSentenceTranslation?: string;
  usageNote?: string;
  contextNote?: string;
  commonMistake: string;
  pronunciationText: string;
  relatedPhrases: string[];
  googleTranslation?: string;
  googleTranslationUpdatedAt?: string;
  googleTranslationAudio?: PhraseAudioAsset;
  somaliMeaningAudio?: PhraseAudioAsset;
  somaliSentenceAudio?: PhraseAudioAsset;
  aiProvider?: PreferredAiProvider | string;
  aiProviderLabel?: string;
  aiModel?: string;
}

export interface PhraseExample {
  id: string;
  phraseId: string;
  exampleText: string;
  exampleType: ExampleType;
  translationText?: string;
  audio?: PhraseAudioAsset;
  translationAudio?: PhraseAudioAsset;
}

export interface ReviewData {
  id: string;
  phraseId: string;
  reviewCount: number;
  difficultyRating?: ReviewRating;
  lastReviewedAt?: string;
  nextReviewAt: string;
  confidenceScore: number;
}

export interface AIGenerationResult {
  phraseType: PhraseType;
  standardMeaning: string;
  easyMeaning: string;
  aiExplanation: string;
  usageContext: string;
  examples: { type: ExampleType; text: string; translation?: string }[];
  somaliMeaning: string;
  partOfSpeech?: string;
  somaliExplanation: string;
  somaliSentence: string;
  somaliSentenceTranslation?: string;
  usageNote?: string;
  contextNote?: string;
  commonMistake: string;
  pronunciationText: string;
  relatedPhrases: string[];
  aiProvider?: PreferredAiProvider | string;
  aiProviderLabel?: string;
  aiModel?: string;
}

export interface DashboardStats {
  totalPhrases: number;
  learnedPhrases: number;
  favoritePhrases: number;
  dueForReview: number;
}

export type ImportedTextStatus = "processing" | "ready" | "failed";

export interface ImportedTextProgress {
  percent: number;
  completedSectionIds: string[];
  currentSectionId: string;
  lastOpenedAt: string;
}

export interface ImportedTextBlock {
  type: "heading" | "paragraph" | "quote" | "list";
  text?: string;
  level?: number;
  items?: string[];
}

export interface ImportedTextSection {
  id: string;
  title: string;
  blocks: ImportedTextBlock[];
  plainText: string;
  wordCount: number;
  estimatedReadingTime: number;
}

export interface ImportedTextSummary {
  id: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  author: string;
  publishedAt: string;
  importedAt: string;
  updatedAt: string;
  wordCount: number;
  estimatedReadingTime: number;
  sectionCount: number;
  pageCount: number;
  progress: ImportedTextProgress;
  favIconUrl: string;
  thumbnailUrl: string;
  status: ImportedTextStatus;
  previewText: string;
  failureReason: string;
  origin?: "extension" | "manual";
}

export interface ImportedText extends ImportedTextSummary {
  userId: string;
  canonicalUrl?: string;
  plainText: string;
  content: {
    sections: ImportedTextSection[];
  };
  language?: string;
  origin?: "extension" | "manual";
}

export interface ImportedTextListResponse {
  items: ImportedTextSummary[];
  availableSources: string[];
  total: number;
}
