import { useState, useEffect, useCallback } from "react";
import { Phrase, PhraseType, DifficultyLevel, ReviewRating, DashboardStats } from "@/types";
import { generateAIExplanation } from "@/lib/ai";
import { buildNextReviewDate } from "@/lib/review";

const STORAGE_KEY = "phrasepal_phrases";

function loadPhrases(): Phrase[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function savePhrases(phrases: Phrase[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(phrases));
}

function normalizePhraseKey(text: string) {
  return text.trim().toLowerCase();
}

function sanitizePhrase(input: Phrase): Phrase {
  const now = new Date().toISOString();
  const phraseId = input.id || crypto.randomUUID();
  const createdAt = input.createdAt || now;
  const updatedAt = input.updatedAt || createdAt;

  return {
    ...input,
    id: phraseId,
    phraseText: input.phraseText?.trim() || "",
    notes: input.notes || "",
    tags: Array.isArray(input.tags) ? input.tags : [],
    isFavorite: Boolean(input.isFavorite),
    isLearned: Boolean(input.isLearned),
    createdAt,
    updatedAt,
    explanation: input.explanation
      ? {
          ...input.explanation,
          id: input.explanation.id || crypto.randomUUID(),
          phraseId,
          relatedPhrases: Array.isArray(input.explanation.relatedPhrases) ? input.explanation.relatedPhrases : [],
        }
      : undefined,
    examples: Array.isArray(input.examples)
      ? input.examples.map((example) => ({
          ...example,
          id: example.id || crypto.randomUUID(),
          phraseId,
        }))
      : [],
    review: input.review
      ? {
          ...input.review,
          id: input.review.id || crypto.randomUUID(),
          phraseId,
          reviewCount: Number.isFinite(input.review.reviewCount) ? input.review.reviewCount : 0,
          nextReviewAt: input.review.nextReviewAt || now,
          confidenceScore: Number.isFinite(input.review.confidenceScore) ? input.review.confidenceScore : 0,
        }
      : {
          id: crypto.randomUUID(),
          phraseId,
          reviewCount: 0,
          nextReviewAt: now,
          confidenceScore: 0,
        },
  };
}

function isPhraseLike(value: unknown): value is Phrase {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Phrase>;
  return typeof candidate.phraseText === "string" && typeof candidate.phraseType === "string";
}

export function usePhraseStore() {
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setPhrases(loadPhrases());
    setIsLoading(false);
  }, []);

  const persist = useCallback((updated: Phrase[]) => {
    setPhrases(updated);
    savePhrases(updated);
  }, []);

  const addPhrase = useCallback(
    async (
      data: { phraseText: string; phraseType: PhraseType; category: string; notes: string; difficultyLevel: DifficultyLevel },
      aiResultOverride?: {
        standardMeaning: string;
        easyMeaning: string;
        aiExplanation: string;
        usageContext: string;
        examples: { type: "simple" | "daily" | "work" | "extra" | "somali"; text: string }[];
        somaliMeaning: string;
        somaliExplanation: string;
        somaliSentence: string;
        commonMistake: string;
        pronunciationText: string;
        relatedPhrases: string[];
        phraseType: PhraseType;
      }
    ) => {
      setIsLoading(true);

      const aiResult = aiResultOverride ?? await generateAIExplanation(data.phraseText);

      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const newPhrase: Phrase = {
        id,
        phraseText: data.phraseText,
        phraseType: aiResult.phraseType || data.phraseType,
        category: data.category,
        notes: data.notes,
        isFavorite: false,
        isLearned: false,
        tags: [],
        difficultyLevel: data.difficultyLevel,
        createdAt: now,
        updatedAt: now,
        explanation: {
          id: crypto.randomUUID(),
          phraseId: id,
          standardMeaning: aiResult.standardMeaning,
          easyMeaning: aiResult.easyMeaning,
          aiExplanation: aiResult.aiExplanation,
          usageContext: aiResult.usageContext,
          somaliMeaning: aiResult.somaliMeaning,
          somaliExplanation: aiResult.somaliExplanation,
          somaliSentence: aiResult.somaliSentence,
          commonMistake: aiResult.commonMistake,
          pronunciationText: aiResult.pronunciationText,
          relatedPhrases: aiResult.relatedPhrases,
        },
        examples: aiResult.examples.map((ex) => ({
          id: crypto.randomUUID(),
          phraseId: id,
          exampleText: ex.text,
          exampleType: ex.type,
        })),
        review: {
          id: crypto.randomUUID(),
          phraseId: id,
          reviewCount: 0,
          nextReviewAt: now,
          confidenceScore: 0,
        },
      };

      const updated = [...phrases, newPhrase];
      persist(updated);
      setIsLoading(false);
      return newPhrase;
    },
    [phrases, persist]
  );

  const updatePhrase = useCallback(
    (id: string, updates: Partial<Phrase>) => {
      const updated = phrases.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
      );
      persist(updated);
    },
    [phrases, persist]
  );

  const deletePhrase = useCallback(
    (id: string) => {
      persist(phrases.filter((p) => p.id !== id));
    },
    [phrases, persist]
  );

  const toggleFavorite = useCallback(
    (id: string) => {
      const p = phrases.find((p) => p.id === id);
      if (p) updatePhrase(id, { isFavorite: !p.isFavorite });
    },
    [phrases, updatePhrase]
  );

  const toggleLearned = useCallback(
    (id: string) => {
      const p = phrases.find((p) => p.id === id);
      if (p) updatePhrase(id, { isLearned: !p.isLearned });
    },
    [phrases, updatePhrase]
  );

  const reviewPhrase = useCallback(
    (id: string, rating: ReviewRating) => {
      const phrase = phrases.find((p) => p.id === id);
      if (!phrase?.review) return;

      const now = new Date();
      const currentConfidence = phrase.review.confidenceScore;
      const nextDate = buildNextReviewDate(phrase.review, rating, now);

      const confidenceDelta: Record<ReviewRating, number> = {
        again: -15,
        hard: 5,
        good: 12,
        easy: 20,
      };

      updatePhrase(id, {
        review: {
          ...phrase.review,
          reviewCount: phrase.review.reviewCount + 1,
          difficultyRating: rating,
          lastReviewedAt: now.toISOString(),
          nextReviewAt: nextDate.toISOString(),
          confidenceScore: Math.max(0, Math.min(100, currentConfidence + confidenceDelta[rating])),
        },
      });
    },
    [phrases, updatePhrase]
  );

  const getStats = useCallback((): DashboardStats => {
    const now = new Date();
    return {
      totalPhrases: phrases.length,
      learnedPhrases: phrases.filter((p) => p.isLearned).length,
      favoritePhrases: phrases.filter((p) => p.isFavorite).length,
      dueForReview: phrases.filter((p) => p.review && new Date(p.review.nextReviewAt) <= now).length,
    };
  }, [phrases]);

  const getDueForReview = useCallback((): Phrase[] => {
    const now = new Date();
    return phrases.filter((p) => p.review && new Date(p.review.nextReviewAt) <= now);
  }, [phrases]);

  const savePhraseEdits = useCallback(
    async (
      id: string,
      updates: {
        phraseText: string;
        phraseType: PhraseType;
        category: string;
        notes: string;
        difficultyLevel: DifficultyLevel;
      }
    ) => {
      const phrase = phrases.find((item) => item.id === id);
      if (!phrase) return null;

      const trimmedPhraseText = updates.phraseText.trim();
      const shouldRefreshAI =
        trimmedPhraseText !== phrase.phraseText || updates.phraseType !== phrase.phraseType;

      setIsLoading(true);

      let explanation = phrase.explanation;
      let examples = phrase.examples;

      if (shouldRefreshAI) {
        const aiResult = await generateAIExplanation(trimmedPhraseText);
        explanation = {
          id: phrase.explanation?.id ?? crypto.randomUUID(),
          phraseId: id,
          standardMeaning: aiResult.standardMeaning,
          easyMeaning: aiResult.easyMeaning,
          aiExplanation: aiResult.aiExplanation,
          usageContext: aiResult.usageContext,
          somaliMeaning: aiResult.somaliMeaning,
          somaliExplanation: aiResult.somaliExplanation,
          somaliSentence: aiResult.somaliSentence,
          commonMistake: aiResult.commonMistake,
          pronunciationText: aiResult.pronunciationText,
          relatedPhrases: aiResult.relatedPhrases,
        };
        examples = aiResult.examples.map((example, index) => ({
          id: phrase.examples?.[index]?.id ?? crypto.randomUUID(),
          phraseId: id,
          exampleText: example.text,
          exampleType: example.type,
        }));
      }

      const updated = phrases.map((item) =>
        item.id === id
          ? {
              ...item,
              phraseText: trimmedPhraseText,
              phraseType: updates.phraseType,
              category: updates.category,
              notes: updates.notes,
              difficultyLevel: updates.difficultyLevel,
              explanation,
              examples,
              updatedAt: new Date().toISOString(),
            }
          : item
      );

      persist(updated);
      setIsLoading(false);
      return updated.find((item) => item.id === id) ?? null;
    },
    [phrases, persist]
  );

  const exportBackup = useCallback(() => {
    return [...phrases].sort((a, b) => a.phraseText.localeCompare(b.phraseText));
  }, [phrases]);

  const importBackup = useCallback(
    (incomingPhrases: Phrase[]) => {
      const sanitizedIncoming = incomingPhrases.filter(isPhraseLike).map(sanitizePhrase).filter((phrase) => phrase.phraseText);
      const mergedMap = new Map<string, Phrase>();

      for (const phrase of phrases) {
        mergedMap.set(normalizePhraseKey(phrase.phraseText), phrase);
      }

      let importedCount = 0;
      let replacedCount = 0;

      for (const phrase of sanitizedIncoming) {
        const key = normalizePhraseKey(phrase.phraseText);
        if (mergedMap.has(key)) {
          replacedCount += 1;
        } else {
          importedCount += 1;
        }
        mergedMap.set(key, phrase);
      }

      const merged = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      persist(merged);

      return {
        importedCount,
        replacedCount,
        totalCount: merged.length,
      };
    },
    [phrases, persist]
  );

  return {
    phrases,
    isLoading,
    addPhrase,
    updatePhrase,
    deletePhrase,
    toggleFavorite,
    toggleLearned,
    reviewPhrase,
    getStats,
    getDueForReview,
    savePhraseEdits,
    exportBackup,
    importBackup,
  };
}
