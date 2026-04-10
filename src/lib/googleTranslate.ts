const GOOGLE_TRANSLATE_ENDPOINT = "https://translation.googleapis.com/language/translate/v2";

function getGoogleTranslateKey() {
  return import.meta.env.VITE_GOOGLE_TRANSLATE_KEY as string | undefined;
}

function decodeHtml(value: string) {
  if (typeof document === "undefined") return value;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

export async function translateTexts(
  texts: string[],
  options: { source?: string; target?: string } = {},
): Promise<string[]> {
  const apiKey = getGoogleTranslateKey();
  const source = options.source || "en";
  const target = options.target || "so";
  const normalized = texts.map((text) => String(text || "").trim());

  if (!apiKey) {
    throw new Error("Google Translate API key missing");
  }

  if (!normalized.length) {
    return [];
  }

  const response = await fetch(`${GOOGLE_TRANSLATE_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: normalized,
      source,
      target,
      format: "text",
    }),
  });

  const data = await response.json();
  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || "Google Translate request failed");
  }

  const translations = Array.isArray(data?.data?.translations)
    ? data.data.translations.map((entry: { translatedText?: string }) =>
        decodeHtml(String(entry?.translatedText || "")).trim(),
      )
    : [];

  while (translations.length < normalized.length) {
    translations.push("");
  }

  return translations.slice(0, normalized.length);
}

export async function translateText(
  text: string,
  options: { source?: string; target?: string } = {},
): Promise<string> {
  const [translation = ""] = await translateTexts([text], options);
  return translation;
}
