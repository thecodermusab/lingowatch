import { PhraseAudioAsset } from "@/types";
import { playPreparedAudio, primeAudioUrl, startUnlockedPlaybackSession } from "@/lib/audioPlayback";

export interface TtsAssetRequestItem {
  key?: string;
  text: string;
  language?: string;
  voice?: string;
}

interface TtsAssetResponseItem extends PhraseAudioAsset {
  key: string;
}

interface TtsAssetResponse {
  items: TtsAssetResponseItem[];
}

const AUDIO_POLL_ATTEMPTS = 6;
const AUDIO_POLL_DELAY_MS = 1500;

const runtimeAudioCache = new Map<string, PhraseAudioAsset>();
const runtimeAudioPromises = new Map<string, Promise<PhraseAudioAsset | null>>();

function setLimitedCache(cache: Map<string, PhraseAudioAsset>, key: string, value: PhraseAudioAsset, limit = 120) {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  while (cache.size > limit) {
    cache.delete(cache.keys().next().value);
  }
}

function normalizeRequest(item: TtsAssetRequestItem, index = 0): TtsAssetRequestItem & { key: string } {
  return {
    key: String(item.key || index),
    text: String(item.text || "").trim(),
    language: item.language,
    voice: item.voice,
  };
}

export function getPlayableAudioUrl(asset?: PhraseAudioAsset | null) {
  return String(asset?.audioUrl || asset?.playbackUrl || "").trim();
}

function getRuntimeAudioKey(item: TtsAssetRequestItem | PhraseAudioAsset | null | undefined) {
  const text = String(item?.text || "").trim().toLowerCase();
  const language = String(item?.language || "").trim().toLowerCase();
  const voice = String(item?.voice || "").trim().toLowerCase();
  return `${text}::${language}::${voice}`;
}

export function rememberPlayableAsset(item: TtsAssetRequestItem | PhraseAudioAsset, asset?: PhraseAudioAsset | null) {
  const resolvedAsset = asset || item;
  const playableUrl = getPlayableAudioUrl(resolvedAsset);
  const key = getRuntimeAudioKey(asset ? item : resolvedAsset);
  if (!resolvedAsset || !playableUrl || !key) return null;

  const nextAsset = { ...resolvedAsset, text: String(resolvedAsset.text || "").trim() };
  setLimitedCache(runtimeAudioCache, key, nextAsset);
  primeAudioUrl(playableUrl);
  return nextAsset;
}

export function getRuntimePlayableAsset(item: TtsAssetRequestItem, existingAsset?: PhraseAudioAsset | null) {
  if (existingAsset) {
    const remembered = rememberPlayableAsset(item, existingAsset);
    if (remembered) return remembered;
  }

  const key = getRuntimeAudioKey(item);
  return key ? runtimeAudioCache.get(key) || null : null;
}

export async function requestTtsAssets(items: TtsAssetRequestItem[]): Promise<Map<string, TtsAssetResponseItem>> {
  const normalized = items
    .map((item, index) => normalizeRequest(item, index))
    .filter((item) => item.text);

  if (!normalized.length) {
    return new Map();
  }

  const response = await fetch("/api/tts/cache", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: normalized }),
  });

  if (!response.ok) {
    throw new Error(`Audio cache request failed (${response.status})`);
  }

  const data = await response.json() as TtsAssetResponse;
  const result = new Map<string, TtsAssetResponseItem>();
  for (const item of Array.isArray(data?.items) ? data.items : []) {
    result.set(String(item.key), item);
  }
  return result;
}

export async function requestTtsAsset(item: TtsAssetRequestItem): Promise<PhraseAudioAsset | null> {
  const normalizedItem = normalizeRequest(item, 0);
  let lastAsset: PhraseAudioAsset | null = null;

  for (let attempt = 0; attempt < AUDIO_POLL_ATTEMPTS; attempt += 1) {
    const responseMap = await requestTtsAssets([normalizedItem]);
    const asset = responseMap.get(normalizedItem.key);
    if (asset) {
      lastAsset = asset;
    }

    if (asset?.audioUrl || asset?.playbackUrl || asset?.audioStatus === "ready" || asset?.audioStatus === "error") {
      return asset || null;
    }

    if (attempt < AUDIO_POLL_ATTEMPTS - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, AUDIO_POLL_DELAY_MS));
    }
  }

  return lastAsset
    ? {
        ...lastAsset,
        audioStatus: "error",
        audioUrl: lastAsset.audioUrl || "",
        playbackUrl: lastAsset.playbackUrl || "",
      }
    : null;
}

export async function ensureRuntimeTtsAsset(
  item: TtsAssetRequestItem,
  existingAsset?: PhraseAudioAsset | null
): Promise<PhraseAudioAsset | null> {
  const cached = getRuntimePlayableAsset(item, existingAsset);
  if (cached) {
    return cached;
  }

  const runtimeKey = getRuntimeAudioKey(item);
  if (!runtimeKey) return null;

  const inFlight = runtimeAudioPromises.get(runtimeKey);
  if (inFlight) {
    return inFlight;
  }

  const promise = requestTtsAsset(item)
    .then((asset) => {
      if (!asset) return null;
      return rememberPlayableAsset(item, asset);
    })
    .finally(() => {
      runtimeAudioPromises.delete(runtimeKey);
    });

  runtimeAudioPromises.set(runtimeKey, promise);
  return promise;
}

export async function playRuntimeTtsAsset(
  item: TtsAssetRequestItem,
  existingAsset?: PhraseAudioAsset | null
): Promise<PhraseAudioAsset | null> {
  const playbackSession = startUnlockedPlaybackSession();
  const asset = await ensureRuntimeTtsAsset(item, existingAsset);
  const playableUrl = getPlayableAudioUrl(asset);
  if (!playableUrl) {
    throw new Error("Audio unavailable");
  }
  await playPreparedAudio(playableUrl, playbackSession);
  return asset;
}
