import { useState, useEffect, useCallback } from "react";
import { Phrase, PhraseAudioPrepProgress, PhraseType, DifficultyLevel, ReviewRating, DashboardStats } from "@/types";
import { generateAIExplanation } from "@/lib/ai";
import { buildNextReviewDate } from "@/lib/review";
import { useAuth } from "@/contexts/AuthContext";
import { accountStorageKey, legacyOwnerEmail, normalizeOwnerEmail } from "@/lib/accountStorage";
import { buildPhraseAudioRequests, getPhraseAudioPrepProgress, mergePhraseAudioAssets, requestPhraseAudioAssets } from "@/lib/phraseAudio";
import { translateText } from "@/lib/googleTranslate";

const STORAGE_KEY = "lingowatch_phrases";
const LEGACY_STORAGE_KEY = "phrasepal_phrases";
const DELETED_KEYS_STORAGE_KEY = "lingowatch_deleted_phrase_keys";
const LOCAL_API_ORIGIN = "http://127.0.0.1:3001";
const AUDIO_BACKFILL_CONCURRENCY = 2;
const activeAudioBackfillJobs = new Map<string, Promise<void>>();

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

function getPhraseStorageKey(userEmail?: string | null) {
  return accountStorageKey(STORAGE_KEY, userEmail);
}

function getDeletedKeysStorageKey(userEmail?: string | null) {
  return accountStorageKey(DELETED_KEYS_STORAGE_KEY, userEmail);
}

function loadPhrases(userEmail?: string | null): Phrase[] {
  try {
    const storageKey = getPhraseStorageKey(userEmail);
    let data = localStorage.getItem(storageKey);
    if (!data && normalizeOwnerEmail(userEmail) === legacyOwnerEmail()) {
      data = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
      if (data) {
        localStorage.setItem(storageKey, data);
      }
    }
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function savePhrases(phrases: Phrase[], userEmail?: string | null) {
  localStorage.setItem(getPhraseStorageKey(userEmail), JSON.stringify(phrases));
}

function loadDeletedPhraseKeys(userEmail?: string | null): string[] {
  try {
    const storageKey = getDeletedKeysStorageKey(userEmail);
    let data = localStorage.getItem(storageKey);
    if (!data && normalizeOwnerEmail(userEmail) === legacyOwnerEmail()) {
      data = localStorage.getItem(DELETED_KEYS_STORAGE_KEY);
      if (data) {
        localStorage.setItem(storageKey, data);
      }
    }
    const parsed = data ? JSON.parse(data) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function saveDeletedPhraseKeys(keys: string[], userEmail?: string | null) {
  localStorage.setItem(getDeletedKeysStorageKey(userEmail), JSON.stringify(Array.from(new Set(keys))));
}

function normalizePhraseKey(text: string) {
  return text.trim().toLowerCase();
}

function markPhraseKeysDeleted(phrases: Pick<Phrase, "phraseText">[], userEmail?: string | null) {
  const deleted = new Set(loadDeletedPhraseKeys(userEmail));
  for (const phrase of phrases) {
    const key = normalizePhraseKey(phrase.phraseText);
    if (key) deleted.add(key);
  }
  saveDeletedPhraseKeys(Array.from(deleted), userEmail);
}

function clearDeletedPhraseKey(phraseText: string, userEmail?: string | null) {
  const key = normalizePhraseKey(phraseText);
  if (!key) return;
  const deleted = loadDeletedPhraseKeys(userEmail).filter((item) => item !== key);
  saveDeletedPhraseKeys(deleted, userEmail);
}

function isLegacyExtensionPhrase(phrase: Phrase) {
  return phrase.category === "YouTube" || phrase.tags.includes("youtube");
}

async function ensureDeleteResponse(response: Response) {
  if (!response.ok && response.status !== 404) {
    throw new Error(`Delete request failed with status ${response.status}`);
  }
}

async function syncPhraseToNeon(phrase: Phrase, userEmail?: string | null) {
  const ownerEmail = normalizeOwnerEmail(userEmail);
  if (!ownerEmail) return;

  try {
    await apiFetch("/api/words", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userEmail: ownerEmail,
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

async function syncPhrasesToNeon(phrases: Phrase[], userEmail?: string | null) {
  await Promise.allSettled(phrases.map((phrase) => syncPhraseToNeon(phrase, userEmail)));
}

async function prewarmPhraseAudio(
  phrase: Phrase,
  userEmail: string | null | undefined,
  persist: (updater: (current: Phrase[]) => Phrase[]) => void,
  onProgress?: (progress: PhraseAudioPrepProgress) => void
) {
  const googleTranslation = phrase.explanation?.googleTranslation || "";
  const requestItems = buildPhraseAudioRequests(phrase, phrase.explanation?.googleTranslation || "");
  const initialProgress = getPhraseAudioPrepProgress(phrase, googleTranslation);
  onProgress?.({
    ...initialProgress,
    state: requestItems.length ? "preparing" : initialProgress.state,
    updatedAt: new Date().toISOString(),
  });
  if (!requestItems.length) return;

  try {
    const assetMap = await requestPhraseAudioAssets(requestItems);
    if (!assetMap.size) {
      onProgress?.({
        ...initialProgress,
        state: initialProgress.total ? "error" : initialProgress.state,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    const warmedPhrase = sanitizePhrase(
      mergePhraseAudioAssets(phrase, assetMap, googleTranslation)
    );

    persist((current) => {
      let changed = false;
      const updated = current.map((item) => {
        if (item.id !== warmedPhrase.id) return item;
        changed = true;
        return warmedPhrase;
      });
      return changed ? updated : current;
    });

    void syncPhraseToNeon(warmedPhrase, userEmail);
    onProgress?.(getPhraseAudioPrepProgress(warmedPhrase, googleTranslation));
  } catch {
    // Audio prewarm is best-effort only.
    onProgress?.({
      ...initialProgress,
      error: initialProgress.error + initialProgress.pending,
      pending: 0,
      state: initialProgress.total ? "error" : initialProgress.state,
      updatedAt: new Date().toISOString(),
    });
  }
}

async function syncPhraseDeletion(phrase: Phrase, userEmail?: string | null) {
  const ownerEmail = normalizeOwnerEmail(userEmail);
  if (!ownerEmail) return;

  const requests: Promise<void>[] = [
    apiFetch(`/api/words/${encodeURIComponent(normalizePhraseKey(phrase.phraseText))}?userEmail=${encodeURIComponent(ownerEmail)}`, {
      method: "DELETE",
    }).then(ensureDeleteResponse).catch(() => {}),
  ];

  if (isLegacyExtensionPhrase(phrase)) {
    requests.push(
      apiFetch(`/api/extension/saved-phrases/${encodeURIComponent(phrase.id)}?userEmail=${encodeURIComponent(ownerEmail)}`, {
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

function clearPhraseAudioState(phrase: Phrase): Phrase {
  return {
    ...phrase,
    audioUrl: undefined,
    audio: undefined,
    explanation: phrase.explanation
      ? {
          ...phrase.explanation,
          googleTranslationAudio: undefined,
          somaliMeaningAudio: undefined,
          somaliSentenceAudio: undefined,
        }
      : undefined,
    examples: Array.isArray(phrase.examples)
      ? phrase.examples.map((example) => ({
          ...example,
          audio: undefined,
          translationAudio: undefined,
        }))
      : [],
  };
}

function shouldHydrateFallbackAiResult(
  aiResultOverride?: {
    aiProvider?: string;
    aiProviderLabel?: string;
    aiModel?: string;
  }
) {
  if (!aiResultOverride) return false;

  const provider = aiResultOverride.aiProvider?.trim().toLowerCase();
  const providerLabel = aiResultOverride.aiProviderLabel?.trim().toLowerCase();
  const model = aiResultOverride.aiModel?.trim().toLowerCase();

  return (
    !provider ||
    provider === "fallback" ||
    providerLabel === "local fallback" ||
    model === "none"
  );
}

function isPhraseLike(value: unknown): value is Phrase {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Phrase>;
  return typeof candidate.phraseText === "string" && typeof candidate.phraseType === "string";
}

export function usePhraseStore() {
  const { user } = useAuth();
  const userEmail = normalizeOwnerEmail(user?.email);
  const [phrases, setPhrases] = useState<Phrase[]>(() => {
    // Load from localStorage immediately so the first render never shows an empty state.
    try {
      const stored = localStorage.getItem("lingowatch_user");
      if (!stored) return [];
      const u = JSON.parse(stored) as { email?: string };
      const email = normalizeOwnerEmail(u?.email);
      if (!email) return [];
      return loadPhrases(email);
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [audioPrepByPhraseId, setAudioPrepByPhraseId] = useState<Record<string, PhraseAudioPrepProgress>>({});

  const syncExternalPhrases = useCallback(async () => {
    if (!userEmail) return;

    const userParam = `userEmail=${encodeURIComponent(userEmail)}`;
    const [neonWords, extPhrases] = await Promise.all([
      apiJson<unknown[]>(`/api/words?${userParam}`, []),
      apiJson<Phrase[]>(`/api/extension/saved-phrases?${userParam}`, []),
    ]);
    const currentDeletedKeys = new Set(loadDeletedPhraseKeys(userEmail));
    const current = loadPhrases(userEmail).filter((phrase) => !currentDeletedKeys.has(normalizePhraseKey(phrase.phraseText)));
    const map = new Map(current.map((phrase) => [normalizePhraseKey(phrase.phraseText), phrase]));
    let changed = false;

    for (const row of neonWords as Array<{ word: string; display_word: string; translation: string; saved_at: string; audio_url?: string; phrase_data?: Phrase }>) {
      const key = normalizePhraseKey(row.display_word || row.word);
      if (!key || currentDeletedKeys.has(key)) continue;
      const rowAudioUrl = row.audio_url || undefined;
      const neonPhrase = row.phrase_data
        ? sanitizePhrase({ ...row.phrase_data, audioUrl: rowAudioUrl || row.phrase_data.audioUrl })
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
              audioUrl: rowAudioUrl,
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
      savePhrases(merged, userEmail);
    }
  }, [userEmail]);

  useEffect(() => {
    if (!userEmail) {
      setIsLoading(false);
      return;
    }

    const deletedKeys = new Set(loadDeletedPhraseKeys(userEmail));
    const local = loadPhrases(userEmail).filter((phrase) => !deletedKeys.has(normalizePhraseKey(phrase.phraseText)));
    setPhrases(local);
    setIsLoading(false);
    void syncPhrasesToNeon(local, userEmail);
    void syncExternalPhrases();
  }, [syncExternalPhrases, userEmail]);

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
    savePhrases(updated, userEmail);
  }, [userEmail]);

  const persistWithUpdater = useCallback((updater: (current: Phrase[]) => Phrase[]) => {
    setPhrases((current) => {
      const updated = updater(current);
      savePhrases(updated, userEmail);
      return updated;
    });
  }, [userEmail]);

  const updateAudioPrepProgress = useCallback((phraseId: string, progress: PhraseAudioPrepProgress) => {
    setAudioPrepByPhraseId((current) => ({
      ...current,
      [phraseId]: progress,
    }));
  }, []);

  useEffect(() => {
    setAudioPrepByPhraseId((current) => {
      const next: Record<string, PhraseAudioPrepProgress> = {};

      for (const phrase of phrases) {
        const derived = getPhraseAudioPrepProgress(phrase, phrase.explanation?.googleTranslation || "");
        next[phrase.id] = activeAudioBackfillJobs.has(phrase.id)
          ? {
              ...derived,
              state: derived.total ? "preparing" : derived.state,
              updatedAt: new Date().toISOString(),
            }
          : derived;
      }

      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(next);
      const sameKeys = currentKeys.length === nextKeys.length && currentKeys.every((key) => key in next);
      const sameValues = sameKeys && nextKeys.every((key) => {
        const previous = current[key];
        const value = next[key];
        return previous
          && previous.total === value.total
          && previous.ready === value.ready
          && previous.pending === value.pending
          && previous.error === value.error
          && previous.mainReady === value.mainReady
          && previous.exampleTotal === value.exampleTotal
          && previous.exampleReady === value.exampleReady
          && previous.state === value.state;
      });

      return sameValues ? current : next;
    });
  }, [phrases]);

  useEffect(() => {
    if (!phrases.length) return;

    const queue = phrases
      .filter((phrase) => getPhraseAudioPrepProgress(phrase, phrase.explanation?.googleTranslation || "").pending > 0)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    if (!queue.length) return;

    const availableSlots = Math.max(0, AUDIO_BACKFILL_CONCURRENCY - activeAudioBackfillJobs.size);
    if (!availableSlots) return;

    for (const phrase of queue.slice(0, availableSlots)) {
      if (activeAudioBackfillJobs.has(phrase.id)) continue;

      const job = prewarmPhraseAudio(phrase, userEmail, persistWithUpdater, (progress) => {
        updateAudioPrepProgress(phrase.id, progress);
      }).finally(() => {
        activeAudioBackfillJobs.delete(phrase.id);
      });

      activeAudioBackfillJobs.set(phrase.id, job);
    }
  }, [phrases, persistWithUpdater, updateAudioPrepProgress, userEmail]);

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
      const shouldHydrateAiInBackground = shouldHydrateFallbackAiResult(aiResultOverride);
      const googleTranslation = aiResultOverride ? "" : await translateText(data.phraseText).catch(() => "");
      const aiResult = aiResultOverride ?? await generateAIExplanation(data.phraseText, undefined, false, googleTranslation);

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
          googleTranslation,
          googleTranslationUpdatedAt: googleTranslation ? now : undefined,
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
          audio: undefined,
          translationAudio: undefined,
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
      clearDeletedPhraseKey(newPhrase.phraseText, userEmail);
      persist(updated);
      syncPhraseToNeon(newPhrase, userEmail);
      void prewarmPhraseAudio(newPhrase, userEmail, persistWithUpdater, (progress) => {
        updateAudioPrepProgress(newPhrase.id, progress);
      });
      if (shouldHydrateAiInBackground) {
        void (async () => {
          try {
            const hydratedGoogleTranslation = await translateText(data.phraseText).catch(() => "");
            const hydratedAiResult = await generateAIExplanation(
              data.phraseText,
              undefined,
              false,
              hydratedGoogleTranslation
            );
            const hydratedAt = new Date().toISOString();

            let refreshedPhrase: Phrase | null = null;
            persistWithUpdater((current) =>
              current.map((item) => {
                if (item.id !== id) return item;

                refreshedPhrase = sanitizePhrase(
                  clearPhraseAudioState({
                    ...item,
                    phraseType: hydratedAiResult.phraseType || item.phraseType,
                    updatedAt: hydratedAt,
                    explanation: {
                      id: item.explanation?.id ?? crypto.randomUUID(),
                      phraseId: id,
                      standardMeaning: hydratedAiResult.standardMeaning,
                      easyMeaning: hydratedAiResult.easyMeaning,
                      aiExplanation: hydratedAiResult.aiExplanation,
                      usageContext: hydratedAiResult.usageContext,
                      somaliMeaning: hydratedAiResult.somaliMeaning,
                      partOfSpeech: hydratedAiResult.partOfSpeech,
                      somaliExplanation: hydratedAiResult.somaliExplanation,
                      somaliSentence: hydratedAiResult.somaliSentence,
                      somaliSentenceTranslation: hydratedAiResult.somaliSentenceTranslation,
                      usageNote: hydratedAiResult.usageNote,
                      contextNote: hydratedAiResult.contextNote,
                      commonMistake: hydratedAiResult.commonMistake,
                      pronunciationText: hydratedAiResult.pronunciationText,
                      relatedPhrases: hydratedAiResult.relatedPhrases,
                      googleTranslation: hydratedGoogleTranslation || item.explanation?.googleTranslation,
                      googleTranslationUpdatedAt: hydratedGoogleTranslation
                        ? hydratedAt
                        : item.explanation?.googleTranslationUpdatedAt,
                      aiProvider: hydratedAiResult.aiProvider,
                      aiProviderLabel: hydratedAiResult.aiProviderLabel,
                      aiModel: hydratedAiResult.aiModel,
                    },
                    examples: hydratedAiResult.examples.map((example, index) => ({
                      id: item.examples?.[index]?.id ?? crypto.randomUUID(),
                      phraseId: id,
                      exampleText: example.text,
                      exampleType: example.type,
                      translationText: example.translation,
                    })),
                  })
                );

                return refreshedPhrase;
              })
            );

            if (refreshedPhrase) {
              void syncPhraseToNeon(refreshedPhrase, userEmail);
              void prewarmPhraseAudio(refreshedPhrase, userEmail, persistWithUpdater, (progress) => {
                updateAudioPrepProgress(refreshedPhrase.id, progress);
              });
            }
          } catch {
            // Keep the fallback explanation if background AI hydration fails.
          }
        })();
      }
      setIsLoading(false);
      return newPhrase;
    },
    [phrases, persist, persistWithUpdater, updateAudioPrepProgress, userEmail]
  );

  const updatePhrase = useCallback(
    (id: string, updates: Partial<Phrase>) => {
      const updated = phrases.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
      );
      persist(updated);
      const updatedPhrase = updated.find((p) => p.id === id);
      if (updatedPhrase) syncPhraseToNeon(updatedPhrase, userEmail);
    },
    [phrases, persist, userEmail]
  );

  const deletePhrase = useCallback(
    async (id: string) => {
      const phrase = phrases.find((item) => item.id === id);
      if (!phrase) return;

      markPhraseKeysDeleted([phrase], userEmail);
      persist(phrases.filter((p) => p.id !== id));
      await syncPhraseDeletion(phrase, userEmail);
    },
    [phrases, persist, userEmail]
  );

  const bulkDeletePhrases = useCallback(
    async (ids: string[]) => {
      const idSet = new Set(ids);
      const phrasesToDelete = phrases.filter((phrase) => idSet.has(phrase.id));
      if (!phrasesToDelete.length) return;

      markPhraseKeysDeleted(phrasesToDelete, userEmail);
      persist(phrases.filter((phrase) => !idSet.has(phrase.id)));
      await Promise.all(phrasesToDelete.map((phrase) => syncPhraseDeletion(phrase, userEmail)));
    },
    [phrases, persist, userEmail]
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
      void syncPhrasesToNeon(updated.filter((phrase) => idSet.has(phrase.id)), userEmail);
    },
    [phrases, persist, userEmail]
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
        const googleTranslation = await translateText(trimmedPhraseText).catch(() => "");
        const aiResult = await generateAIExplanation(trimmedPhraseText, undefined, false, googleTranslation);
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
          googleTranslation: googleTranslation || phrase.explanation?.googleTranslation,
          googleTranslationUpdatedAt: googleTranslation ? new Date().toISOString() : phrase.explanation?.googleTranslationUpdatedAt,
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
          ? sanitizePhrase(shouldRefreshAI
            ? clearPhraseAudioState({
              ...item,
              phraseText: trimmedPhraseText,
              phraseType: updates.phraseType,
              category: updates.category,
              notes: updates.notes,
              difficultyLevel: updates.difficultyLevel,
              explanation,
              examples,
              updatedAt: new Date().toISOString(),
            })
            : {
              ...item,
              phraseText: trimmedPhraseText,
              phraseType: updates.phraseType,
              category: updates.category,
              notes: updates.notes,
              difficultyLevel: updates.difficultyLevel,
              explanation,
              examples,
              updatedAt: new Date().toISOString(),
            })
          : item
      );

      clearDeletedPhraseKey(trimmedPhraseText, userEmail);
      persist(updated);
      const savedPhrase = updated.find((item) => item.id === id) ?? null;
      if (savedPhrase) {
        // If word text changed, remove old key from Neon before upserting new
        if (trimmedPhraseText !== phrase.phraseText) {
          apiFetch(`/api/words/${encodeURIComponent(normalizePhraseKey(phrase.phraseText))}?userEmail=${encodeURIComponent(userEmail)}`, { method: "DELETE" }).catch(() => {});
        }
        syncPhraseToNeon(savedPhrase, userEmail);
        if (shouldRefreshAI) {
          void prewarmPhraseAudio(savedPhrase, userEmail, persistWithUpdater, (progress) => {
            updateAudioPrepProgress(savedPhrase.id, progress);
          });
        }
      }
      setIsLoading(false);
      return savedPhrase;
    },
    [phrases, persist, persistWithUpdater, updateAudioPrepProgress, userEmail]
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
        clearDeletedPhraseKey(phrase.phraseText, userEmail);
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
      void syncPhrasesToNeon(sanitizedIncoming, userEmail);

      return {
        importedCount,
        replacedCount,
        totalCount: merged.length,
      };
    },
    [phrases, persist, userEmail]
  );

  return {
    phrases,
    audioPrepByPhraseId,
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
