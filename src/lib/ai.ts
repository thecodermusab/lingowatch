import { AIGenerationResult, DifficultyLevel, PhraseType } from "@/types";

export async function generateAIExplanation(phraseText: string): Promise<AIGenerationResult> {
  const response = await fetch("/api/ai/explain", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phraseText }),
  });

  if (!response.ok) {
    let message = "AI request failed";

    try {
      const data = await response.json();
      if (typeof data?.error === "string") {
        message = data.error;
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

export async function getAIHealth(): Promise<AiHealthResult> {
  const response = await fetch("/api/ai/health");

  if (!response.ok) {
    let message = "Failed to load AI status";

    try {
      const data = await response.json();
      if (typeof data?.error === "string") {
        message = data.error;
      }
    } catch {}

    throw new Error(message);
  }

  return response.json();
}

export async function testAIConnection(): Promise<AiTestResult> {
  const response = await fetch("/api/ai/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    let message = "AI connection test failed";

    try {
      const data = await response.json();
      if (typeof data?.error === "string") {
        message = data.error;
      }
    } catch {}

    throw new Error(message);
  }

  return response.json();
}

export async function generateRandomPhraseEntries(request: RandomPhraseRequest): Promise<RandomPhraseEntry[]> {
  const response = await fetch("/api/ai/random-phrases", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let message = "Could not generate more phrases";

    try {
      const data = await response.json();
      if (typeof data?.error === "string") {
        message = data.error;
      }
    } catch {}

    throw new Error(message);
  }

  return response.json();
}
