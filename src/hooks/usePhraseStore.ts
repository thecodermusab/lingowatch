import { useState, useEffect, useCallback } from "react";
import { Phrase, PhraseType, DifficultyLevel, ReviewRating, DashboardStats } from "@/types";
import { generateAIExplanation } from "@/lib/ai";
import { buildNextReviewDate } from "@/lib/review";

const STORAGE_KEY = "lingowatch_phrases";
const LEGACY_STORAGE_KEY = "phrasepal_phrases";
const DELETED_KEYS_STORAGE_KEY = "lingowatch_deleted_phrase_keys";
const LOCAL_API_ORIGIN = "http://127.0.0.1:3001";

function shouldTryLocalApiFallback() {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

async function apiFetch(path: string, init?: RequestInit) {
  try {
    return await fetch(path, init);
  } catch (error) {
    if (path.startsWith("/api/") && shouldTryLocalApiFallback()) {
      return fetch(`${LOCAL_API_ORIGIN}${path}`, init);
    }
    throw error;
  }
}

async function apiJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await apiFetch(path);
    return response.ok ? response.json() : fallback;
  } catch {
    return fallback;
  }
}

function loadPhrases(): Phrase[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (data && !localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, data);
    }
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function savePhrases(phrases: Phrase[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(phrases));
}

function loadDeletedPhraseKeys(): string[] {
  try {
    const data = localStorage.getItem(DELETED_KEYS_STORAGE_KEY);
    const parsed = data ? JSON.parse(data) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function saveDeletedPhraseKeys(keys: string[]) {
  localStorage.setItem(DELETED_KEYS_STORAGE_KEY, JSON.stringify(Array.from(new Set(keys))));
}

function normalizePhraseKey(text: string) {
  return text.trim().toLowerCase();
}

function markPhraseKeysDeleted(phrases: Pick<Phrase, "phraseText">[]) {
  const deleted = new Set(loadDeletedPhraseKeys());
  for (const phrase of phrases) {
    const key = normalizePhraseKey(phrase.phraseText);
    if (key) deleted.add(key);
  }
  saveDeletedPhraseKeys(Array.from(deleted));
}

function clearDeletedPhraseKey(phraseText: string) {
  const key = normalizePhraseKey(phraseText);
  if (!key) return;
  const deleted = loadDeletedPhraseKeys().filter((item) => item !== key);
  saveDeletedPhraseKeys(deleted);
}

function isLegacyExtensionPhrase(phrase: Phrase) {
  return phrase.category === "YouTube" || phrase.tags.includes("youtube");
}

async function ensureDeleteResponse(response: Response) {
  if (!response.ok && response.status !== 404) {
    throw new Error(`Delete request failed with status ${response.status}`);
  }
}

async function syncPhraseToNeon(phrase: Phrase) {
  try {
    await apiFetch("/api/words", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        word: normalizePhraseKey(phrase.phraseText),
        displayWord: phrase.phraseText,
        translation: phrase.notes,
        source: "app",
        phrase_data: phrase,
      }),
    });
  } catch {
    console.warn("Failed to sync phrase to Neon:", phrase.phraseText);
  }
}

async function syncPhrasesToNeon(phrases: Phrase[]) {
  await Promise.allSettled(phrases.map((phrase) => syncPhraseToNeon(phrase)));
}

async function syncPhraseDeletion(phrase: Phrase) {
  const requests: Promise<void>[] = [
    apiFetch(`/api/words/${encodeURIComponent(normalizePhraseKey(phrase.phraseText))}`, {
      method: "DELETE",
    }).then(ensureDeleteResponse).catch(() => {}),
  ];

  if (isLegacyExtensionPhrase(phrase)) {
    requests.push(
      apiFetch(`/api/extension/saved-phrases/${encodeURIComponent(phrase.id)}`, {
        method: "DELETE",
      }).then(ensureDeleteResponse).catch(() => {})
    );
  }

  await Promise.all(requests);
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
  const [phrases, setPhrases] = useState<Phrase[]>(() => {
    const deletedKeys = new Set(loadDeletedPhraseKeys());
    return loadPhrases().filter((phrase) => !deletedKeys.has(normalizePhraseKey(phrase.phraseText)));
  });
  const [isLoading, setIsLoading] = useState(false);

  const syncExternalPhrases = useCallback(async () => {
    const [neonWords, extPhrases] = await Promise.all([
      apiJson<unknown[]>("/api/words", []),
      apiJson<Phrase[]>("/api/extension/saved-phrases", []),
    ]);
    const currentDeletedKeys = new Set(loadDeletedPhraseKeys());
    const current = loadPhrases().filter((phrase) => !currentDeletedKeys.has(normalizePhraseKey(phrase.phraseText)));
    const map = new Map(current.map((phrase) => [normalizePhraseKey(phrase.phraseText), phrase]));
    let changed = false;

    for (const row of neonWords as Array<{ word: string; display_word: string; translation: string; saved_at: string; phrase_data?: Phrase }>) {
      const key = normalizePhraseKey(row.display_word || row.word);
      if (!key || currentDeletedKeys.has(key)) continue;
      const neonPhrase = row.phrase_data
        ? sanitizePhrase(row.phrase_data)
        : (() => {
            const now = row.saved_at ? new Date(row.saved_at).toISOString() : new Date().toISOString();
            return sanitizePhrase({
              id: crypto.randomUUID(),
              phraseText: row.display_word || row.word,
              phraseType: "word" as const,
              category: "Extension",
              notes: row.translation || "",
              isFavorite: false,
              isLearned: false,
              tags: ["extension"],
              difficultyLevel: "intermediate" as const,
              createdAt: now,
              updatedAt: now,
              examples: [],
            });
          })();
      const existing = map.get(key);
      if (!existing || new Date(neonPhrase.updatedAt) > new Date(existing.updatedAt)) {
        map.set(key, neonPhrase);
        changed = true;
      }
    }

    for (const extPhrase of extPhrases) {
      const key = normalizePhraseKey(extPhrase.phraseText);
      if (!key || currentDeletedKeys.has(key)) continue;
      const sanitized = sanitizePhrase(extPhrase);
      const existing = map.get(key);
      if (!existing || new Date(sanitized.updatedAt) > new Date(existing.updatedAt)) {
        map.set(key, sanitized);
        changed = true;
      }
    }

    if (changed) {
      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      setPhrases(merged);
      savePhrases(merged);
    }
  }, []);

  useEffect(() => {
    const deletedKeys = new Set(loadDeletedPhraseKeys());
    const local = loadPhrases().filter((phrase) => !deletedKeys.has(normalizePhraseKey(phrase.phraseText)));
    setPhrases(local);
    setIsLoading(false);
    void syncPhrasesToNeon(local);
    void syncExternalPhrases();
  }, [syncExternalPhrases]);

  useEffect(() => {
    let stopped = false;
    let inFlight = false;

    const refresh = async () => {
      if (stopped || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        await syncExternalPhrases();
      } finally {
        inFlight = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    const interval = window.setInterval(() => {
      void refresh();
    }, 2500);

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
    };
  }, [syncExternalPhrases]);

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
        examples: { type: "simple" | "daily" | "work" | "extra" | "somali"; text: string; translation?: string }[];
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
        phraseType: PhraseType;
        aiProvider?: string;
        aiProviderLabel?: string;
        aiModel?: string;
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
          partOfSpeech: aiResult.partOfSpeech,
          somaliExplanation: aiResult.somaliExplanation,
          somaliSentence: aiResult.somaliSentence,
          somaliSentenceTranslation: aiResult.somaliSentenceTranslation,
          usageNote: aiResult.usageNote,
          contextNote: aiResult.contextNote,
          commonMistake: aiResult.commonMistake,
          pronunciationText: aiResult.pronunciationText,
          relatedPhrases: aiResult.relatedPhrases,
          aiProvider: aiResult.aiProvider,
          aiProviderLabel: aiResult.aiProviderLabel,
          aiModel: aiResult.aiModel,
        },
        examples: aiResult.examples.map((ex) => ({
          id: crypto.randomUUID(),
          phraseId: id,
          exampleText: ex.text,
          exampleType: ex.type,
          translationText: ex.translation,
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
      clearDeletedPhraseKey(newPhrase.phraseText);
      persist(updated);
      syncPhraseToNeon(newPhrase);
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
      const updatedPhrase = updated.find((p) => p.id === id);
      if (updatedPhrase) syncPhraseToNeon(updatedPhrase);
    },
    [phrases, persist]
  );

  const deletePhrase = useCallback(
    async (id: string) => {
      const phrase = phrases.find((item) => item.id === id);
      if (!phrase) return;

      markPhraseKeysDeleted([phrase]);
      persist(phrases.filter((p) => p.id !== id));
      await syncPhraseDeletion(phrase);
    },
    [phrases, persist]
  );

  const bulkDeletePhrases = useCallback(
    async (ids: string[]) => {
      const idSet = new Set(ids);
      const phrasesToDelete = phrases.filter((phrase) => idSet.has(phrase.id));
      if (!phrasesToDelete.length) return;

      markPhraseKeysDeleted(phrasesToDelete);
      persist(phrases.filter((phrase) => !idSet.has(phrase.id)));
      await Promise.all(phrasesToDelete.map(syncPhraseDeletion));
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

  const bulkUpdatePhrases = useCallback(
    (ids: string[], updates: Partial<Pick<Phrase, "isFavorite" | "isLearned">>) => {
      const idSet = new Set(ids);
      const now = new Date().toISOString();
      const updated = phrases.map((phrase) =>
        idSet.has(phrase.id) ? { ...phrase, ...updates, updatedAt: now } : phrase
      );
      persist(updated);
      void syncPhrasesToNeon(updated.filter((phrase) => idSet.has(phrase.id)));
    },
    [phrases, persist]
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
          partOfSpeech: aiResult.partOfSpeech,
          somaliExplanation: aiResult.somaliExplanation,
          somaliSentence: aiResult.somaliSentence,
          somaliSentenceTranslation: aiResult.somaliSentenceTranslation,
          usageNote: aiResult.usageNote,
          contextNote: aiResult.contextNote,
          commonMistake: aiResult.commonMistake,
          pronunciationText: aiResult.pronunciationText,
          relatedPhrases: aiResult.relatedPhrases,
          googleTranslation: phrase.explanation?.googleTranslation,
          googleTranslationUpdatedAt: phrase.explanation?.googleTranslationUpdatedAt,
          aiProvider: aiResult.aiProvider,
          aiProviderLabel: aiResult.aiProviderLabel,
          aiModel: aiResult.aiModel,
        };
        examples = aiResult.examples.map((example, index) => ({
          id: phrase.examples?.[index]?.id ?? crypto.randomUUID(),
          phraseId: id,
          exampleText: example.text,
          exampleType: example.type,
          translationText: example.translation,
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

      clearDeletedPhraseKey(trimmedPhraseText);
      persist(updated);
      const savedPhrase = updated.find((item) => item.id === id) ?? null;
      if (savedPhrase) {
        // If word text changed, remove old key from Neon before upserting new
        if (trimmedPhraseText !== phrase.phraseText) {
          apiFetch(`/api/words/${encodeURIComponent(normalizePhraseKey(phrase.phraseText))}`, { method: "DELETE" }).catch(() => {});
        }
        syncPhraseToNeon(savedPhrase);
      }
      setIsLoading(false);
      return savedPhrase;
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
        clearDeletedPhraseKey(phrase.phraseText);
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
      void syncPhrasesToNeon(sanitizedIncoming);

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
    bulkDeletePhrases,
    toggleFavorite,
    toggleLearned,
    bulkUpdatePhrases,
    reviewPhrase,
    getStats,
    getDueForReview,
    savePhraseEdits,
    exportBackup,
    importBackup,
  };
}
