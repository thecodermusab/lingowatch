export interface TtsWordTiming {
  index: number;
  word: string;
  startTime: number;
  endTime: number;
}

export interface TtsAudioResult {
  audioContent?: string;
  audioUrl: string;
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

export async function fetchTtsAudioContent(text: string): Promise<string | null> {
  const key = cacheKey(text);
  if (!key) return null;

  const cached = audioCache.get(key);
  if (cached) return cached;

  const cachedBlob = await readCachedBlob(idbKey("plain", key));
  if (cachedBlob) {
    const source = blobToObjectUrl(cachedBlob.blob);
    audioCache.set(key, source);
    return source;
  }

  const existing = audioPromises.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: key }),
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const data = await response.json();
      const audioContent = typeof data?.audioContent === "string" ? data.audioContent : "";
      const audioUrl = typeof data?.audioUrl === "string" ? data.audioUrl : "";
      if (!audioContent && !audioUrl) return null;

      let blob: Blob | null = null;
      if (audioContent) {
        blob = base64ToBlob(audioContent);
      } else if (audioUrl) {
        const blobRes = await fetch(audioUrl);
        if (!blobRes.ok) return null;
        blob = await blobRes.blob();
      }

      if (!blob) return null;
      await writeCachedBlob(idbKey("plain", key), blob);
      const source = blobToObjectUrl(blob);
      audioCache.set(key, source);
      return source;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
      audioPromises.delete(key);
    }
  })();

  audioPromises.set(key, promise);
  return promise;
}

export async function getTtsAudioDataUrl(text: string): Promise<string | null> {
  return fetchTtsAudioContent(text);
}

export async function fetchTimedTtsAudio(text: string): Promise<TtsAudioResult | null> {
  const key = cacheKey(text);
  if (!key) return null;

  const cached = timedAudioCache.get(key);
  if (cached) return cached;

  const cachedBlob = await readCachedBlob(idbKey("timed", key));
  if (cachedBlob) {
    const result = {
      audioUrl: blobToObjectUrl(cachedBlob.blob),
      wordTimings: cachedBlob.wordTimings || [],
    };
    audioCache.set(key, result.audioUrl);
    timedAudioCache.set(key, result);
    return result;
  }

  const existing = timedAudioPromises.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: key, includeWordTimings: true }),
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const data = await response.json();
      const audioContent = typeof data?.audioContent === "string" ? data.audioContent : "";
      const audioUrl = typeof data?.audioUrl === "string" ? data.audioUrl : "";
      const wordTimings = Array.isArray(data?.wordTimings) ? data.wordTimings : [];
      if (!audioContent && !audioUrl) return null;

      let blob: Blob | null = null;
      if (audioContent) {
        blob = base64ToBlob(audioContent);
      } else if (audioUrl) {
        const blobRes = await fetch(audioUrl);
        if (!blobRes.ok) return null;
        blob = await blobRes.blob();
      }

      if (!blob) return null;
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
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
      timedAudioPromises.delete(key);
    }
  })();

  timedAudioPromises.set(key, promise);
  return promise;
}

let _activeTtsAudio: HTMLAudioElement | null = null;

async function playAudioSource(source: string): Promise<void> {
  _activeTtsAudio?.pause();
  const audio = new Audio(source);
  _activeTtsAudio = audio;
  await audio.play();
}

export async function speakText(text: string): Promise<void> {
  const key = cacheKey(text);
  if (!key) return;

  const cachedSource = audioCache.get(key);
  if (cachedSource) {
    await playAudioSource(cachedSource);
    return;
  }

  const dataUrl = await getTtsAudioDataUrl(key);
  if (!dataUrl) throw new Error("This audio file could not be played right now.");
  await playAudioSource(dataUrl);
}
