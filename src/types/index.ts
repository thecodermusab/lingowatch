export type PhraseType = "word" | "phrase" | "phrasal_verb" | "idiom" | "expression";
export type DifficultyLevel = "beginner" | "intermediate" | "advanced";
export type ExampleType = "simple" | "daily" | "work" | "extra" | "somali";
export type ReviewRating = "again" | "hard" | "good" | "easy";

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  preferredLanguage: string;
  englishLevel: DifficultyLevel;
  somaliModeEnabled: boolean;
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
  somaliExplanation: string;
  somaliSentence: string;
  commonMistake: string;
  pronunciationText: string;
  relatedPhrases: string[];
}

export interface PhraseExample {
  id: string;
  phraseId: string;
  exampleText: string;
  exampleType: ExampleType;
  translationText?: string;
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
  examples: { type: ExampleType; text: string }[];
  somaliMeaning: string;
  somaliExplanation: string;
  somaliSentence: string;
  commonMistake: string;
  pronunciationText: string;
  relatedPhrases: string[];
}

export interface DashboardStats {
  totalPhrases: number;
  learnedPhrases: number;
  favoritePhrases: number;
  dueForReview: number;
}
