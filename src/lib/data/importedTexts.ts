import { ImportedText, ImportedTextListResponse, ImportedTextSummary } from "@/types";

const API_ROOT = "/api/imported-texts";

export interface ImportedTextFilters {
  search?: string;
  source?: string;
  sort?: "newest" | "oldest" | "longest" | "shortest";
  status?: "all" | "processing" | "ready" | "failed";
}

export interface CreateManualImportedTextInput {
  userId: string;
  title: string;
  sourceName?: string;
  sourceUrl?: string;
  author?: string;
  publishedAt?: string;
  content: string;
}

export interface ImportSessionPayload {
  userId: string;
  email?: string;
  fullName?: string;
}

export interface ImportSessionResponse {
  token: string;
  expiresAt: string;
  user: {
    userId: string;
    email: string;
    fullName: string;
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchImportedTexts(userId: string, filters: ImportedTextFilters = {}): Promise<ImportedTextListResponse> {
  const params = new URLSearchParams({ userId });

  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.source?.trim() && filters.source !== "all") params.set("source", filters.source.trim());
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);

  const response = await fetch(`${API_ROOT}?${params.toString()}`);
  return parseResponse<ImportedTextListResponse>(response);
}

export async function fetchImportedTextById(userId: string, id: string): Promise<ImportedText> {
  const params = new URLSearchParams({ userId });
  const response = await fetch(`${API_ROOT}/${encodeURIComponent(id)}?${params.toString()}`);
  const data = await parseResponse<{ item: ImportedText }>(response);
  return data.item;
}

export async function deleteImportedText(userId: string, id: string): Promise<void> {
  const params = new URLSearchParams({ userId });
  const response = await fetch(`${API_ROOT}/${encodeURIComponent(id)}?${params.toString()}`, {
    method: "DELETE",
  });

  await parseResponse<{ ok: true }>(response);
}

export async function createManualImportedText(input: CreateManualImportedTextInput): Promise<ImportedTextSummary> {
  const response = await fetch(`${API_ROOT}/manual`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const data = await parseResponse<{ item: ImportedTextSummary }>(response);
  return data.item;
}

export async function updateImportedTextProgress(
  userId: string,
  id: string,
  payload: Partial<{
    percent: number;
    completedSectionIds: string[];
    currentSectionId: string;
    lastOpenedAt: string;
    touch: boolean;
  }>
): Promise<ImportedTextSummary> {
  const response = await fetch(`${API_ROOT}/${encodeURIComponent(id)}/progress`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId,
      ...payload,
    }),
  });

  const data = await parseResponse<{ item: ImportedTextSummary }>(response);
  return data.item;
}

export async function createImportedTextSession(payload: ImportSessionPayload): Promise<ImportSessionResponse> {
  const response = await fetch(`${API_ROOT}/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseResponse<ImportSessionResponse>(response);
}
