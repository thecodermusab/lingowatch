const preparedAudio = new Map<string, HTMLAudioElement>();
let activeAudio: HTMLAudioElement | null = null;
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

function canUseAudioElement() {
  return typeof Audio !== "undefined";
}

export function primeAudioUrl(url: string): HTMLAudioElement | null {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl || !canUseAudioElement()) return null;

  const existing = preparedAudio.get(normalizedUrl);
  if (existing) {
    existing.preload = "auto";
    existing.load();
    return existing;
  }

  const audio = new Audio(normalizedUrl);
  audio.preload = "auto";
  audio.load();
  preparedAudio.set(normalizedUrl, audio);
  return audio;
}

export function getPreparedAudio(url: string): HTMLAudioElement | null {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl || !canUseAudioElement()) return null;
  return preparedAudio.get(normalizedUrl) || primeAudioUrl(normalizedUrl);
}

export function startUnlockedPlaybackSession(): HTMLAudioElement | null {
  if (!canUseAudioElement()) return null;

  if (activeAudio) {
    activeAudio.pause();
  }

  const audio = new Audio();
  audio.preload = "auto";
  activeAudio = audio;
  audio.src = SILENT_WAV;
  void audio.play().catch(() => {});
  return audio;
}

export async function playPreparedAudio(url: string, playbackAudio?: HTMLAudioElement | null): Promise<void> {
  const prepared = getPreparedAudio(url);
  if (!prepared) {
    throw new Error("Audio is unavailable");
  }

  const audio = playbackAudio || prepared;

  if (activeAudio && activeAudio !== audio) {
    activeAudio.pause();
  }

  activeAudio = audio;
  if (audio !== prepared) {
    audio.src = url;
    audio.preload = "auto";
    audio.load();
  }
  audio.pause();
  audio.currentTime = 0;
  await audio.play();
}
