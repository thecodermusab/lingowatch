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
  const source = options.source || "en";
  const target = options.target || "so";
  const normalized = texts.map((text) => String(text || "").trim());

  if (!normalized.length) {
    return [];
  }

  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts: normalized, source, target }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data?.translations)) {
    throw new Error(data?.error || "Translation request failed");
  }
  return data.translations.map((item: unknown) => decodeHtml(String(item || "").trim()));
}

export async function translateText(
  text: string,
  options: { source?: string; target?: string } = {},
): Promise<string> {
  const [translation = ""] = await translateTexts([text], options);
  return translation;
}
