import { AIGenerationResult, DifficultyLevel, Phrase, PhraseType, PreferredAiProvider } from "@/types";

export const AI_PROVIDER_OPTIONS: { value: PreferredAiProvider; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "nvidia", label: "GLM-5.1 (NVIDIA)" },
  { value: "glm4", label: "GLM-4.7 Flash" },
  { value: "deepseek", label: "DeepSeek V3.2" },
  { value: "gemini-lite", label: "Gemini 2.5 Flash-Lite" },
  { value: "gemini", label: "Gemini" },
  { value: "grok", label: "Grok" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "cerebras", label: "Cerebras" },
  { value: "antigravity", label: "Antigravity" },
];

export function getAiProviderLabel(provider?: string, fallback?: string) {
  if (fallback) return fallback;
  return AI_PROVIDER_OPTIONS.find((item) => item.value === provider)?.label || provider || "Unknown AI";
}

export const SAVED_WORD_REGENERATION_OPTIONS: { value: PreferredAiProvider; label: string }[] = [
  { value: "deepseek", label: "DeepSeek V3.2" },
  { value: "gemini-lite", label: "Gemini 2.5 Flash-Lite" },
  { value: "gemini", label: "Gemini 2.0 Flash" },
  { value: "grok", label: "Grok" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "cerebras", label: "Cerebras" },
  { value: "glm4", label: "GLM-4.7 Flash" },
];

export function getSavedWordRegenerationProvider(phrase?: Pick<Phrase, "phraseText" | "phraseType" | "difficultyLevel" | "review">): PreferredAiProvider {
  if (!phrase) return "deepseek";

  const text = String(phrase.phraseText || "").trim();
  const isContextHeavyType = phrase.phraseType === "idiom" || phrase.phraseType === "phrasal_verb" || phrase.phraseType === "expression";
  const isMarkedHard = phrase.difficultyLevel === "advanced" || phrase.review?.difficultyRating === "again" || phrase.review?.difficultyRating === "hard";
  const isLikelyHardWord = phrase.phraseType === "word" && (text.length >= 12 || /[-']/g.test(text));

  return isContextHeavyType || isMarkedHard || isLikelyHardWord ? "gemini" : "deepseek";
}

function getPreferredAiProvider(): PreferredAiProvider | undefined {
  try {
    const raw = localStorage.getItem("lingowatch_user") ?? localStorage.getItem("phrasepal_user");
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { preferredAiProvider?: PreferredAiProvider };
    return parsed.preferredAiProvider;
  } catch {
    return undefined;
  }
}

function simplifyAiErrorMessage(message: string) {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();

  if (
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("rate-limit") ||
    lower.includes('"code":429') ||
    lower.includes("429")
  ) {
    return "AI quota reached right now. Try again later or switch to another provider.";
  }

  if (
    lower.includes("all ai providers failed") ||
    lower.includes("provider is unavailable") ||
    lower.includes("providers are unavailable")
  ) {
    return "All AI providers are unavailable right now. Try again later.";
  }

  if (
    lower.includes("invalid api key") ||
    lower.includes("api_key_invalid") ||
    lower.includes("api key expired") ||
    lower.includes("unauthorized") ||
    lower.includes("missing") ||
    lower.includes("not configured")
  ) {
    return "AI provider is not configured correctly. Check your API key settings.";
  }

  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

export async function generateAIExplanation(
  phraseText: string,
  preferredProvider: PreferredAiProvider | undefined = getPreferredAiProvider(),
  strictProvider = false,
  googleTranslation = "",
): Promise<AIGenerationResult> {
  const response = await fetch("/api/ai/explain", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phraseText, preferredProvider, strictProvider, googleTranslation }),
  });

  if (!response.ok) {
    let message = "AI request failed";

    try {
      const data = await response.json();
      if (typeof data?.error === "string") {
        message = simplifyAiErrorMessage(data.error);
      }
    } catch {}

    throw new Error(message);
  }

  return response.json();
}

export async function generateStory(words: string[]): Promise<{ title: string; content: string }> {
  const preferredProvider = getPreferredAiProvider();
  const response = await fetch("/api/ai/story", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ words, preferredProvider }),
  });

  if (!response.ok) {
    let message = "Could not generate story";
    try {
      const data = await response.json();
      if (typeof data?.error === "string") message = simplifyAiErrorMessage(data.error);
    } catch {}
    throw new Error(message);
  }

  const data = await response.json();
  return { title: String(data.title || "Untitled Story"), content: String(data.story || "") };
}

export interface RandomPhraseRequest {
  count?: number;
  difficulty?: "all" | DifficultyLevel;
  phraseType?: "all" | PhraseType;
  category?: string;
  excludePhrases?: string[];
}

export interface RandomPhraseEntry {
  phraseText: string;
  phraseType: PhraseType;
  category: string;
  difficultyLevel: DifficultyLevel;
}

export interface AiHealthResult {
  provider: string;
  model: string;
  configured: boolean;
}

export interface AiTestResult {
  ok: boolean;
  provider: string;
  model: string;
  message: string;
}

export interface AiProviderStatusResult {
  provider: PreferredAiProvider;
  model: string;
  configured: boolean;
  ok: boolean;
  message: string;
}

export async function getAIHealth(): Promise<AiHealthResult> {
  const preferredProvider = getPreferredAiProvider();
  const query = preferredProvider ? `?preferredProvider=${encodeURIComponent(preferredProvider)}` : "";
  const response = await fetch(`/api/ai/health${query}`);

  if (!response.ok) {
    let message = "Failed to load AI status";

    try {
      const data = await response.json();
      if (typeof data?.error === "string") {
        message = simplifyAiErrorMessage(data.error);
      }
    } catch {}

    throw new Error(message);
  }

  return response.json();
}

export async function testAIConnection(): Promise<AiTestResult> {
  const preferredProvider = getPreferredAiProvider();
  const response = await fetch("/api/ai/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ preferredProvider }),
  });

  if (!response.ok) {
    let message = "AI connection test failed";

    try {
      const data = await response.json();
      if (typeof data?.error === "string") {
        message = simplifyAiErrorMessage(data.error);
      }
    } catch {}

    throw new Error(message);
  }

  return response.json();
}

export async function getAllAIProviderStatuses(): Promise<AiProviderStatusResult[]> {
  const response = await fetch("/api/ai/providers/status");

  if (!response.ok) {
    let message = "Could not test AI providers";

    try {
      const data = await response.json();
      if (typeof data?.error === "string") {
        message = simplifyAiErrorMessage(data.error);
      }
    } catch {}

    throw new Error(message);
  }

  return response.json();
}

export async function generateRandomPhraseEntries(request: RandomPhraseRequest): Promise<RandomPhraseEntry[]> {
  const preferredProvider = getPreferredAiProvider();
  const response = await fetch("/api/ai/random-phrases", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...request, preferredProvider }),
  });

  if (!response.ok) {
    let message = "Could not generate more phrases";

    try {
      const data = await response.json();
      if (typeof data?.error === "string") {
        message = simplifyAiErrorMessage(data.error);
      }
    } catch {}

    throw new Error(message);
  }

  return response.json();
}
