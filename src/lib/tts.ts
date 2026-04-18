const audioCache = new Map<string, string>();
const audioPromises = new Map<string, Promise<string | null>>();
const TTS_TIMEOUT_MS = 3500;

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
      if (!audioContent) return null;

      audioCache.set(key, audioContent);
      return audioContent;
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
  const audioContent = await fetchTtsAudioContent(text);
  return audioContent ? `data:audio/mp3;base64,${audioContent}` : null;
}

export async function speakText(text: string): Promise<void> {
  const key = cacheKey(text);
  if (!key) return;

  const dataUrl = await getTtsAudioDataUrl(key);
  if (!dataUrl) {
    await fallbackSpeak(key);
    return;
  }

  await new Audio(dataUrl).play().catch(() => fallbackSpeak(key));
}
