const API_KEY = import.meta.env.VITE_GOOGLE_TRANSLATE_KEY as string | undefined;
const cache = new Map<string, string>();

function isMyMemoryWarning(text: string): boolean {
  return text.trim().toUpperCase().startsWith("MYMEMORY WARNING");
}

async function tryBackendGoogle(key: string, target: string): Promise<string> {
  const resp = await fetch("http://127.0.0.1:3001/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: key, source: "en", target }),
  });
  if (!resp.ok) return "";

  const data = await resp.json();
  const text = data.translations?.[0]?.trim() ?? "";
  return text && !isMyMemoryWarning(text) ? text : "";
}

async function tryMyMemory(key: string, target: string): Promise<string> {
  const resp = await fetch(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(key)}&langpair=en|${target}`
  );
  const data = await resp.json();
  // responseStatus 429 = daily limit hit; anything non-200 is an error
  if (data.responseStatus !== 200) return "";
  const text = data.responseData?.translatedText?.trim() ?? "";
  // Guard against the warning message being returned as a translation
  if (isMyMemoryWarning(text)) return "";
  return text;
}

export async function translate(text: string, target = "so"): Promise<string> {
  const key = text.trim();
  if (!key) return "";

  const cacheKey = `${target}:${key}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  let result = "";

  try {
    result = await tryBackendGoogle(key, target);
  } catch {
    // fall through to the bundled Google key, then MyMemory as a filtered last resort
  }

  if (!result && API_KEY) {
    try {
      const resp = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: key, target, format: "text" }),
        }
      );
      const data = await resp.json();
      result = data.data?.translations?.[0]?.translatedText?.trim() ?? "";
      if (isMyMemoryWarning(result)) result = "";
    } catch {
      // fall through to MyMemory
    }
  }

  // MyMemory fallback: used when no API key, or Google Translate failed/returned empty
  if (!result) {
    try {
      result = await tryMyMemory(key, target);
    } catch {
      return "";
    }
  }

  if (result) cache.set(cacheKey, result);
  return result;
}
