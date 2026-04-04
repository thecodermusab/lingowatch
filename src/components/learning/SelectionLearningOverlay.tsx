import { RefObject, useEffect, useState } from "react";
import { generateAIExplanation } from "@/lib/ai";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function normalizeWord(text: string) {
  return text.trim().toLowerCase();
}

function isLookupCandidate(part: string) {
  return /^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(part);
}

function inferWordDifficulty(word: string) {
  if (word.length <= 5) return "beginner" as const;
  if (word.length >= 10) return "advanced" as const;
  return "intermediate" as const;
}

export function SelectionLearningOverlay({ containerRef }: { containerRef?: RefObject<HTMLElement | null> }) {
  const { addPhrase } = usePhraseStore();
  const { toast, dismiss } = useToast();
  const { user, updateProfile } = useAuth();
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedWordPosition, setSelectedWordPosition] = useState<{ top: number; left: number } | null>(null);
  const [lookupWord, setLookupWord] = useState<string | null>(null);
  const [lookupPreview, setLookupPreview] = useState<Awaited<ReturnType<typeof generateAIExplanation>> | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function handleSelection() {
      const selection = window.getSelection();
      const rawText = selection?.toString().trim() ?? "";
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const containerNode = range?.commonAncestorContainer ?? null;
      const previewElement = containerRef?.current ?? document.querySelector("main");
      const activeElement = document.activeElement as HTMLElement | null;
      const isInsideContainer =
        previewElement &&
        containerNode &&
        previewElement.contains(containerNode.nodeType === Node.TEXT_NODE ? containerNode.parentNode : containerNode);
      const isTypingTarget =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.isContentEditable);

      if (!rawText || !isLookupCandidate(rawText) || rawText.length < 3 || !isInsideContainer || isTypingTarget) {
        setSelectedWord(null);
        setSelectedWordPosition(null);
        return;
      }

      const rect = range?.getBoundingClientRect();
      if (!rect) return;

      const popupWidth = 160;
      const top = Math.max(12, rect.top - 18);
      const left = Math.min(
        window.innerWidth - popupWidth / 2 - 12,
        Math.max(popupWidth / 2 + 12, rect.left + rect.width / 2)
      );

      setSelectedWord(normalizeWord(rawText));
      setSelectedWordPosition({ top, left });
    }

    document.addEventListener("selectionchange", handleSelection);
    document.addEventListener("mouseup", handleSelection);
    document.addEventListener("touchend", handleSelection);

    return () => {
      document.removeEventListener("selectionchange", handleSelection);
      document.removeEventListener("mouseup", handleSelection);
      document.removeEventListener("touchend", handleSelection);
    };
  }, [containerRef]);

  async function handleLookupWord(word: string) {
    dismiss();
    setLookupWord(word);
    setLookupPreview(null);
    setLookupError(null);
    setLookupLoading(true);
    try {
      const result = await generateAIExplanation(word);
      setLookupPreview(result);
    } catch (error) {
      dismiss();
      setLookupError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLookupLoading(false);
    }
  }

  function resetLookupState() {
    setLookupWord(null);
    setLookupPreview(null);
    setLookupError(null);
    setLookupLoading(false);
  }

  async function handleSaveWord(word: string, withPreview = lookupPreview) {
    setSaving(true);
    try {
      await addPhrase(
        {
          phraseText: word,
          phraseType: "word",
          category: "Learning",
          difficultyLevel: inferWordDifficulty(word),
          notes: "Saved from word selection",
        },
        withPreview ? { ...withPreview, phraseType: "word" } : undefined
      );
      toast({
        title: "Word added",
        description: `"${word}" was saved to your vocabulary list.`,
      });
      setSelectedWord(null);
      setSelectedWordPosition(null);
      resetLookupState();
      window.getSelection()?.removeAllRanges();
    } catch (error) {
      toast({
        title: "Could not save word",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {selectedWord && selectedWordPosition ? (
        <div
          className="fixed z-50 hidden -translate-x-1/2 -translate-y-full sm:block"
          style={{ top: selectedWordPosition.top, left: selectedWordPosition.left }}
        >
          <div className="relative">
            <div className="flex items-center gap-1 rounded-lg border bg-background/95 p-0.5 shadow-lg backdrop-blur">
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void handleLookupWord(selectedWord)}
              >
                Learn
              </button>
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void handleSaveWord(selectedWord, null)}
                disabled={saving}
              >
                Save
              </button>
            </div>
            <div className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r bg-background/95" />
          </div>
        </div>
      ) : null}

      {selectedWord ? (
        <div className="fixed bottom-4 left-4 right-4 z-40 rounded-2xl border bg-background/95 p-4 shadow-xl backdrop-blur sm:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Selected word</p>
              <p className="truncate text-sm font-medium text-foreground">{selectedWord}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => void handleLookupWord(selectedWord)}>
                Learn
              </Button>
              <Button size="sm" onClick={() => void handleSaveWord(selectedWord, null)} disabled={saving}>
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={!!lookupWord} onOpenChange={(open) => !open && resetLookupState()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Learn this word</DialogTitle>
            <DialogDescription>{lookupWord}</DialogDescription>
          </DialogHeader>
          {lookupLoading ? (
            <p className="text-sm text-muted-foreground">Loading explanation...</p>
          ) : lookupPreview ? (
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-muted-foreground">Standard Meaning</p>
                <p>{lookupPreview.standardMeaning}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Easy Meaning</p>
                <p>{lookupPreview.easyMeaning}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Explanation</p>
                <p>{lookupPreview.aiExplanation}</p>
              </div>
            </div>
          ) : lookupError ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3">
                <p className="text-sm font-medium text-destructive">Could not explain selected word</p>
                <p className="mt-1 text-sm text-destructive/90">{lookupError}</p>
              </div>

              <div className="space-y-2">
                <Label>Change AI provider</Label>
                <Select
                  value={user?.preferredAiProvider ?? "gemini"}
                  onValueChange={(value) =>
                    updateProfile({ preferredAiProvider: value as "gemini" | "grok" | "openrouter" | "cerebras" })
                  }
                >
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Gemini</SelectItem>
                    <SelectItem value="grok">Grok</SelectItem>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                    <SelectItem value="cerebras">Cerebras</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Switch provider here, then press retry.
                </p>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={resetLookupState}>Close</Button>
            {lookupError ? (
              <Button onClick={() => lookupWord && void handleLookupWord(lookupWord)} disabled={lookupLoading}>
                Retry
              </Button>
            ) : (
              <Button onClick={() => lookupWord && void handleSaveWord(lookupWord)} disabled={!lookupPreview || saving}>
                Save word
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
