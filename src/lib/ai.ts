import { AIGenerationResult, DifficultyLevel, PhraseType } from "@/types";

type PreferredAiProvider = "gemini" | "grok" | "openrouter" | "cerebras";

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
    lower.includes("unauthorized") ||
    lower.includes("missing") ||
    lower.includes("not configured")
  ) {
    return "AI provider is not configured correctly. Check your API key settings.";
  }

  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

export async function generateAIExplanation(phraseText: string): Promise<AIGenerationResult> {
  const preferredProvider = getPreferredAiProvider();
  const response = await fetch("/api/ai/explain", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phraseText, preferredProvider }),
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
  provider: "gemini" | "grok" | "openrouter" | "cerebras";
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
