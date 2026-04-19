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
const TTS_TIMEOUT_MS = 10000;

function cacheKey(text: string) {
  return text.trim();
}

function fallbackSpeak(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error("This audio file could not be played right now."));
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error("This audio file could not be played right now."));
    window.speechSynthesis.speak(utterance);
  });
}

export async function fetchTtsAudioContent(text: string): Promise<string | null> {
  const key = cacheKey(text);
  if (!key) return null;

  const cached = audioCache.get(key);
  if (cached) return cached;

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

      if (audioContent) {
        const source = `data:audio/mpeg;base64,${audioContent}`;
        audioCache.set(key, source);
        return source;
      }

      // Cached response — audioUrl only. Fetch as blob to avoid any CORS issues.
      const blobRes = await fetch(audioUrl);
      if (!blobRes.ok) return null;
      const blob = await blobRes.blob();
      const source = URL.createObjectURL(blob);
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

      // Prefer base64 data URL for reliable browser playback; for cached (audioUrl only), fetch as blob
      let playableUrl: string;
      if (audioContent) {
        playableUrl = `data:audio/mpeg;base64,${audioContent}`;
      } else {
        const blobRes = await fetch(audioUrl);
        if (!blobRes.ok) return null;
        playableUrl = URL.createObjectURL(await blobRes.blob());
      }

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

export async function speakText(text: string): Promise<void> {
  const key = cacheKey(text);
  if (!key) return;

  const dataUrl = await getTtsAudioDataUrl(key);
  if (!dataUrl) return;

  _activeTtsAudio?.pause();
  const audio = new Audio(dataUrl);
  _activeTtsAudio = audio;
  await audio.play().catch(() => {});
}
