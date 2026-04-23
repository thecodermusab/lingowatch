export interface InboxCapture {
  id: string;
  key: string;
  word: string;
  displayWord: string;
  translation: string;
  note: string;
  sentenceContext: string;
  sourceHost: string;
  sourceTitle: string;
  sourceUrl: string;
  timestampSeconds: number | null;
  sourceType: string;
  status: "new" | "imported" | "archived";
  importedPhraseId: string;
  createdAt: string;
  updatedAt: string;
}

export async function getInboxCaptures(): Promise<InboxCapture[]> {
  const response = await fetch("/api/inbox/captures");
  if (!response.ok) {
    throw new Error("Could not load Lingowatch inbox");
  }

  return response.json();
}

export async function updateInboxCapture(id: string, updates: Partial<Pick<InboxCapture, "status" | "importedPhraseId">>) {
  const response = await fetch(`/api/inbox/captures/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error("Could not update inbox item");
  }

  return response.json();
}
