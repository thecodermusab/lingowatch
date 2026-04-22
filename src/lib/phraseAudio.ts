import { Phrase, PhraseAudioAsset, PhraseAudioStatus } from "@/types";

export interface PhraseAudioRequestItem {
  key: string;
  text: string;
  language?: string;
  voice?: string;
}

export interface PhraseAudioCacheItem extends PhraseAudioAsset {
  key: string;
}

type PhraseAudioCacheResponse = {
  items: PhraseAudioCacheItem[];
};

const AUDIO_POLL_ATTEMPTS = 6;
const AUDIO_POLL_DELAY_MS = 1500;

function normalizeText(value: string) {
  return String(value || "").trim();
}

function buildAudioAsset(text: string, existing?: PhraseAudioAsset): PhraseAudioAsset {
  return {
    text: normalizeText(text),
    audioUrl: existing?.audioUrl,
    playbackUrl: existing?.playbackUrl,
    audioStatus: existing?.audioStatus,
    voice: existing?.voice,
    language: existing?.language,
    ttsHash: existing?.ttsHash,
  };
}

function getAudioStatus(existing?: PhraseAudioAsset): PhraseAudioStatus | undefined {
  return existing?.audioStatus;
}

export function buildPhraseAudioRequests(phrase: Phrase, googleTranslation = ""): PhraseAudioRequestItem[] {
  const items = new Map<string, PhraseAudioRequestItem>();
  const pushItem = (item: PhraseAudioRequestItem, existing?: PhraseAudioAsset) => {
    const text = normalizeText(item.text);
    if (!text) return;
    const existingStatus = getAudioStatus(existing);
    if (existing?.audioUrl || existingStatus === "ready") return;
    items.set(item.key, { ...item, text });
  };

  const mainAsset: PhraseAudioAsset | undefined = phrase.audio?.audioUrl || phrase.audio?.playbackUrl || phrase.audioUrl
    ? {
        text: phrase.phraseText,
        audioUrl: phrase.audio?.audioUrl || phrase.audioUrl,
        playbackUrl: phrase.audio?.playbackUrl,
        audioStatus: phrase.audio?.audioStatus || (phrase.audioUrl ? "ready" : undefined),
        voice: phrase.audio?.voice,
        language: phrase.audio?.language,
        ttsHash: phrase.audio?.ttsHash,
      }
    : phrase.audio;

  pushItem(
    {
      key: "main",
      text: phrase.phraseText,
      language: phrase.audio?.language || "en-US",
      voice: phrase.audio?.voice,
    },
    mainAsset
  );

  for (const example of phrase.examples || []) {
    pushItem(
      {
        key: `example:${example.id}`,
        text: example.exampleText,
        language: example.audio?.language || "en-US",
        voice: example.audio?.voice,
      },
      example.audio
    );

    pushItem(
      {
        key: `example-translation:${example.id}`,
        text: example.translationText || "",
        language: example.translationAudio?.language || "so-SO",
        voice: example.translationAudio?.voice,
      },
      example.translationAudio
    );
  }

  const googleTranslationText = normalizeText(googleTranslation);
  pushItem(
    {
      key: "googleTranslation",
      text: googleTranslationText,
      language: phrase.explanation?.googleTranslationAudio?.language || "so-SO",
      voice: phrase.explanation?.googleTranslationAudio?.voice,
    },
    phrase.explanation?.googleTranslationAudio
  );

  pushItem(
    {
      key: "somaliMeaning",
      text: phrase.explanation?.somaliMeaning || "",
      language: phrase.explanation?.somaliMeaningAudio?.language || "so-SO",
      voice: phrase.explanation?.somaliMeaningAudio?.voice,
    },
    phrase.explanation?.somaliMeaningAudio
  );

  pushItem(
    {
      key: "somaliSentence",
      text: phrase.explanation?.somaliSentence || "",
      language: phrase.explanation?.somaliSentenceAudio?.language || "so-SO",
      voice: phrase.explanation?.somaliSentenceAudio?.voice,
    },
    phrase.explanation?.somaliSentenceAudio
  );

  return Array.from(items.values());
}

export async function requestPhraseAudioAssets(items: PhraseAudioRequestItem[]): Promise<Map<string, PhraseAudioCacheItem>> {
  if (!items.length) return new Map();
  const result = new Map<string, PhraseAudioCacheItem>();
  let pendingItems = [...items];

  for (let attempt = 0; attempt < AUDIO_POLL_ATTEMPTS && pendingItems.length; attempt += 1) {
    const response = await fetch("/api/tts/cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: pendingItems }),
    });

    if (!response.ok) {
      throw new Error(`Audio cache request failed (${response.status})`);
    }

    const data = await response.json() as PhraseAudioCacheResponse;
    const responseItems = Array.isArray(data?.items) ? data.items : [];
    const nextPendingItems: PhraseAudioRequestItem[] = [];

    for (const requestedItem of pendingItems) {
      const responseItem = responseItems.find((item) => item.key === requestedItem.key);
      if (!responseItem) {
        nextPendingItems.push(requestedItem);
        continue;
      }

      result.set(responseItem.key, responseItem);

      if (!responseItem.audioUrl && responseItem.audioStatus === "pending") {
        nextPendingItems.push(requestedItem);
      }
    }

    pendingItems = nextPendingItems;
    if (pendingItems.length && attempt < AUDIO_POLL_ATTEMPTS - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, AUDIO_POLL_DELAY_MS));
    }
  }

  for (const pendingItem of pendingItems) {
    const existing = result.get(pendingItem.key);
    if (!existing) continue;
    result.set(pendingItem.key, {
      ...existing,
      audioStatus: "error",
      audioUrl: existing.audioUrl || "",
      playbackUrl: existing.playbackUrl || "",
    });
  }

  return result;
}

export function mergePhraseAudioAssets(
  phrase: Phrase,
  assetMap: Map<string, PhraseAudioCacheItem>,
  googleTranslation = ""
): Phrase {
  if (!assetMap.size) return phrase;

  const nextPhrase: Phrase = {
    ...phrase,
    audio: assetMap.has("main")
      ? { ...buildAudioAsset(phrase.phraseText, phrase.audio), ...assetMap.get("main") }
      : buildAudioAsset(phrase.phraseText, phrase.audio),
  };

  if (nextPhrase.audio?.audioUrl) {
    nextPhrase.audioUrl = nextPhrase.audio.audioUrl;
  }

  if (Array.isArray(phrase.examples)) {
    nextPhrase.examples = phrase.examples.map((example) => {
      const exampleAsset = assetMap.get(`example:${example.id}`);
      const translationAsset = assetMap.get(`example-translation:${example.id}`);

      return {
        ...example,
        audio: exampleAsset
          ? { ...buildAudioAsset(example.exampleText, example.audio), ...exampleAsset }
          : buildAudioAsset(example.exampleText, example.audio),
        translationAudio: translationAsset
          ? { ...buildAudioAsset(example.translationText || "", example.translationAudio), ...translationAsset }
          : buildAudioAsset(example.translationText || "", example.translationAudio),
      };
    });
  }

  if (phrase.explanation) {
    nextPhrase.explanation = {
      ...phrase.explanation,
      googleTranslationAudio: assetMap.has("googleTranslation")
        ? {
            ...buildAudioAsset(googleTranslation, phrase.explanation.googleTranslationAudio),
            ...assetMap.get("googleTranslation"),
          }
        : buildAudioAsset(googleTranslation, phrase.explanation.googleTranslationAudio),
      somaliMeaningAudio: assetMap.has("somaliMeaning")
        ? {
            ...buildAudioAsset(phrase.explanation.somaliMeaning, phrase.explanation.somaliMeaningAudio),
            ...assetMap.get("somaliMeaning"),
          }
        : buildAudioAsset(phrase.explanation.somaliMeaning, phrase.explanation.somaliMeaningAudio),
      somaliSentenceAudio: assetMap.has("somaliSentence")
        ? {
            ...buildAudioAsset(phrase.explanation.somaliSentence, phrase.explanation.somaliSentenceAudio),
            ...assetMap.get("somaliSentence"),
          }
        : buildAudioAsset(phrase.explanation.somaliSentence, phrase.explanation.somaliSentenceAudio),
    };
  }

  return nextPhrase;
}
