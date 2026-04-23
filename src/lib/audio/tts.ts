export interface TtsWordTiming {
  index: number;
  word: string;
  startTime: number;
  endTime: number;
}

export interface TtsAudioResult {
  audioContent?: string;
  audioUrl: string;
  playbackUrl?: string;
  wordTimings: TtsWordTiming[];
}

const audioCache = new Map<string, string>();
const timedAudioCache = new Map<string, TtsAudioResult>();
const audioPromises = new Map<string, Promise<string | null>>();
const timedAudioPromises = new Map<string, Promise<TtsAudioResult | null>>();
const TTS_TIMEOUT_MS = 15000;
const TTS_DB_NAME = "lingowatch-tts-cache";
const TTS_DB_VERSION = 1;
const TTS_STORE = "audio";

type FetchTtsOptions = {
  forceRefresh?: boolean;
  preferProvider?: "aws" | "google";
};

function cacheKey(text: string) {
  return text.trim();
}

function idbKey(kind: "plain" | "timed", text: string) {
  return `${kind}:v1:${cacheKey(text)}`;
}

function openTtsDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    const request = indexedDB.open(TTS_DB_NAME, TTS_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TTS_STORE)) {
        db.createObjectStore(TTS_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readCachedBlob(key: string): Promise<{ blob: Blob; wordTimings?: TtsWordTiming[] } | null> {
  const db = await openTtsDb();
  if (!db) return null;

  return new Promise((resolve) => {
    const tx = db.transaction(TTS_STORE, "readonly");
    const request = tx.objectStore(TTS_STORE).get(key);
    request.onsuccess = () => {
      const row = request.result;
      resolve(row?.blob instanceof Blob ? { blob: row.blob, wordTimings: row.wordTimings } : null);
      db.close();
    };
    request.onerror = () => {
      resolve(null);
      db.close();
    };
  });
}

async function writeCachedBlob(key: string, blob: Blob, wordTimings: TtsWordTiming[] = []): Promise<void> {
  const db = await openTtsDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const tx = db.transaction(TTS_STORE, "readwrite");
    tx.objectStore(TTS_STORE).put({ key, blob, wordTimings, updatedAt: Date.now() });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
  });
}

function base64ToBlob(audioContent: string) {
  const binary = atob(audioContent);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: "audio/mpeg" });
}

function blobToObjectUrl(blob: Blob) {
  return URL.createObjectURL(blob);
}

function setCachedAudioUrl(key: string, url: string) {
  const old = audioCache.get(key);
  if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
  audioCache.set(key, url);
}

async function audioUrlToBlob(audioUrl: string, signal?: AbortSignal): Promise<Blob | null> {
  try {
    const blobRes = await fetch(audioUrl, { signal });
    if (!blobRes.ok) return null;
    return await blobRes.blob();
  } catch {
    return null;
  }
}

export async function fetchTtsAudioContent(text: string, options: FetchTtsOptions = {}): Promise<string | null> {
  const key = cacheKey(text);
  if (!key) return null;

  const cached = options.forceRefresh ? null : audioCache.get(key);
  if (cached) return cached;

  const cachedBlob = options.forceRefresh ? null : await readCachedBlob(idbKey("plain", key));
  if (cachedBlob?.blob) {
    const source = blobToObjectUrl(cachedBlob.blob);
    setCachedAudioUrl(key, source);
    return source;
  }

  const promiseKey = `${key}:${options.forceRefresh ? "refresh" : "cache"}:${options.preferProvider || "auto"}`;
  const existing = audioPromises.get(promiseKey);
  if (existing) return existing;

  const promise = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: key,
          forceRefresh: Boolean(options.forceRefresh),
          preferProvider: options.preferProvider,
        }),
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const data = await response.json();
      const audioContent = typeof data?.audioContent === "string" ? data.audioContent : "";
      const audioUrl = typeof data?.audioUrl === "string" ? data.audioUrl : "";
      const playbackUrl = typeof data?.playbackUrl === "string" ? data.playbackUrl : "";
      const resolvedUrl = playbackUrl || audioUrl;
      if (!audioContent && !resolvedUrl) return null;

      if (audioContent) {
        const blob = base64ToBlob(audioContent);
        await writeCachedBlob(idbKey("plain", key), blob);
        const source = blobToObjectUrl(blob);
        setCachedAudioUrl(key, source);
        return source;
      }

      setCachedAudioUrl(key, resolvedUrl);
      void audioUrlToBlob(resolvedUrl).then((blob) => {
        if (blob) void writeCachedBlob(idbKey("plain", key), blob);
      });
      return resolvedUrl;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
      audioPromises.delete(promiseKey);
    }
  })();

  audioPromises.set(promiseKey, promise);
  return promise;
}

export async function getTtsAudioDataUrl(text: string): Promise<string | null> {
  return fetchTtsAudioContent(text);
}

export async function fetchTimedTtsAudio(text: string, options: FetchTtsOptions = {}): Promise<TtsAudioResult | null> {
  const key = cacheKey(text);
  if (!key) return null;

  const cached = options.forceRefresh ? null : timedAudioCache.get(key);
  if (cached) return cached;

  const cachedBlob = options.forceRefresh ? null : await readCachedBlob(idbKey("timed", key));
  if (cachedBlob) {
    const result = {
      audioUrl: blobToObjectUrl(cachedBlob.blob),
      wordTimings: cachedBlob.wordTimings || [],
    };
    audioCache.set(key, result.audioUrl);
    timedAudioCache.set(key, result);
    return result;
  }

  const promiseKey = `${key}:${options.forceRefresh ? "refresh" : "cache"}:${options.preferProvider || "auto"}`;
  const existing = timedAudioPromises.get(promiseKey);
  if (existing) return existing;

  const promise = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: key,
          includeWordTimings: true,
          forceRefresh: Boolean(options.forceRefresh),
          preferProvider: options.preferProvider,
        }),
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const data = await response.json();
      const audioContent = typeof data?.audioContent === "string" ? data.audioContent : "";
      const audioUrl = typeof data?.audioUrl === "string" ? data.audioUrl : "";
      const playbackUrl = typeof data?.playbackUrl === "string" ? data.playbackUrl : "";
      const wordTimings = Array.isArray(data?.wordTimings) ? data.wordTimings : [];
      const resolvedUrl = playbackUrl || audioUrl;
      if (!audioContent && !resolvedUrl) return null;

      if (audioContent) {
        const blob = base64ToBlob(audioContent);
        await writeCachedBlob(idbKey("timed", key), blob, wordTimings);
        const playableUrl = blobToObjectUrl(blob);
        const result: TtsAudioResult = {
          audioContent,
          audioUrl: playableUrl,
          wordTimings,
        };

        audioCache.set(key, playableUrl);
        timedAudioCache.set(key, result);
        return result;
      }

      const result: TtsAudioResult = {
        audioUrl: resolvedUrl,
        playbackUrl,
        wordTimings,
      };

      setCachedAudioUrl(key, resolvedUrl);
      timedAudioCache.set(key, result);
      void audioUrlToBlob(resolvedUrl).then((blob) => {
        if (blob) void writeCachedBlob(idbKey("timed", key), blob, wordTimings);
      });
      return result;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
      timedAudioPromises.delete(promiseKey);
    }
  })();

  timedAudioPromises.set(promiseKey, promise);
  return promise;
}

// A 0.1s silent WAV used to unlock the audio context within the user gesture
// before the real TTS fetch completes.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

let _activeTtsAudio: HTMLAudioElement | null = null;

export async function speakFromCdnUrl(cdnUrl: string): Promise<void> {
  _activeTtsAudio?.pause();
  const audio = new Audio(cdnUrl);
  audio.preload = "auto";
  _activeTtsAudio = audio;
  try {
    await audio.play();
  } catch {
    if (_activeTtsAudio === audio) _activeTtsAudio = null;
    throw new Error("CDN audio playback failed");
  }
}

export async function speakText(text: string): Promise<void> {
  const key = cacheKey(text);
  if (!key) return;

  _activeTtsAudio?.pause();
  const audio = new Audio();
  audio.preload = "auto";
  _activeTtsAudio = audio;

  // Memory-cached path: set src and play() synchronously within the user gesture.
  const cachedSource = audioCache.get(key);
  if (cachedSource) {
    audio.src = cachedSource;
    try {
      await audio.play();
      return;
    } catch {
      audioCache.delete(key);
    }
  }

  // No memory cache — unlock the audio context immediately with a silent sound,
  // then fetch the real audio. The browser keeps the element "activated" so the
  // second play() call (with the real src) succeeds even though it's after an await.
  audio.src = SILENT_WAV;
  audio.play().catch(() => {});

  let source = await getTtsAudioDataUrl(key);

  if (_activeTtsAudio !== audio) return;

  if (!source) {
    audioCache.delete(key);
    source = await fetchTtsAudioContent(key, { forceRefresh: true });
    if (!source || _activeTtsAudio !== audio) {
      if (_activeTtsAudio === audio) _activeTtsAudio = null;
      throw new Error("This audio file could not be played right now.");
    }
  }

  audio.src = source;
  try {
    await audio.play();
  } catch {
    // Google TTS failed — retry with AWS
    audioCache.delete(key);
    const awsSource = await fetchTtsAudioContent(key, { forceRefresh: true, preferProvider: "aws" });
    if (!awsSource || _activeTtsAudio !== audio) {
      if (_activeTtsAudio === audio) _activeTtsAudio = null;
      throw new Error("This audio file could not be played right now.");
    }
    audio.src = awsSource;
    await audio.play();
  }
}
