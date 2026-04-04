const API_KEY = import.meta.env.VITE_GOOGLE_TRANSLATE_KEY as string | undefined;
const cache = new Map<string, string>();

export async function translate(text: string, target = "so"): Promise<string> {
  const key = text.trim();
  if (!key) return "";

  const cacheKey = `${target}:${key}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  try {
    if (API_KEY) {
      const resp = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: key, target, format: "text" }),
        }
      );
      const data = await resp.json();
      const result: string =
        data.data?.translations?.[0]?.translatedText?.trim() ?? "";
      if (result) cache.set(cacheKey, result);
      return result;
    } else {
      // Free fallback if no key
      const resp = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(key)}&langpair=en|${target}`
      );
      const data = await resp.json();
      const result: string =
        data.responseData?.translatedText?.trim() ?? "";
      if (result) cache.set(cacheKey, result);
      return result;
    }
  } catch {
    return "";
  }
}
