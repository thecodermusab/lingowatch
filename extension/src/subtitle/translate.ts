import { API_BASE_URL } from "../../config.js";

const cache = new Map<string, string>();
const DEFAULT_API_BASE_URL = API_BASE_URL;

function isMyMemoryWarning(text: string): boolean {
  return text.trim().toUpperCase().startsWith("MYMEMORY WARNING");
}

async function getConfiguredApiBaseUrl(): Promise<string> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(["lingowatchApiBaseUrl"], (result) => {
        resolve(String(result.lingowatchApiBaseUrl || "").trim().replace(/\/+$/, "") || DEFAULT_API_BASE_URL);
      });
    } catch {
      resolve(DEFAULT_API_BASE_URL);
    }
  });
}

async function tryBackendGoogle(key: string, target: string): Promise<string> {
  const apiBaseUrl = await getConfiguredApiBaseUrl();
  const resp = await fetch(`${apiBaseUrl}/api/translate`, {
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

async function getStoredGoogleApiKey(): Promise<string> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(["googleApiKey"], (result) => {
        resolve(String(result.googleApiKey || "").trim());
      });
    } catch {
      resolve("");
    }
  });
}

async function tryStoredGoogleKey(key: string, target: string): Promise<string> {
  const apiKey = await getStoredGoogleApiKey();
  if (!apiKey) return "";

  const resp = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: key, target, format: "text" }),
    }
  );
  if (!resp.ok) return "";

  const data = await resp.json();
  const text = data.data?.translations?.[0]?.translatedText?.trim() ?? "";
  return text && !isMyMemoryWarning(text) ? text : "";
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
    // fall through to the user-saved Google key, then MyMemory as a filtered last resort
  }

  if (!result) {
    try {
      result = await tryStoredGoogleKey(key, target);
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
