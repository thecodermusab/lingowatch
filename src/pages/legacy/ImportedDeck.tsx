import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, FolderOpen, Search, Trash2, Volume2, Image as ImageIcon, BookCopy, Loader2 } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteUploadedPhraseBank, loadUploadedPhraseBanks, type ImportedPhraseBankSummary } from "@/lib/data/phraseBank";
import { useToast } from "@/hooks/use-toast";

export default function ImportedDeckPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [decks, setDecks] = useState<ImportedPhraseBankSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [deletingDeckId, setDeletingDeckId] = useState<string | null>(null);
  const [deckPendingDelete, setDeckPendingDelete] = useState<ImportedPhraseBankSummary | null>(null);

  useEffect(() => {
    let active = true;

    async function loadDecks() {
      setLoading(true);
      try {
        const result = await loadUploadedPhraseBanks();
        if (!active) return;
        setDecks(result);
      } catch (error) {
        if (!active) return;
        setDecks([]);
        toast({
          title: "Could not load uploaded decks",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadDecks();
    return () => {
      active = false;
    };
  }, [toast]);

  useEffect(() => {
    if (loading || decks.length === 0 || searchParams.get("all") === "1") {
      return;
    }

    try {
      const lastOpenedDeckId = localStorage.getItem(LAST_OPENED_IMPORTED_DECK_KEY);
      if (!lastOpenedDeckId) return;

      const matchingDeck = decks.find((deck) => deck.deckId === lastOpenedDeckId);
      if (!matchingDeck) return;

      navigate(`/imported-deck/${matchingDeck.deckId}`, { replace: true });
    } catch {
      // Ignore storage failures.
    }
  }, [decks, loading, navigate, searchParams]);

  const filteredDecks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return decks;
    return decks.filter((deck) =>
      [deck.sourceLabel, deck.sourceName]
        .some((value) => String(value || "").toLowerCase().includes(normalizedQuery))
    );
  }, [decks, query]);

  const handleDelete = async (deck: ImportedPhraseBankSummary) => {
    setDeletingDeckId(deck.deckId);
    try {
      await deleteUploadedPhraseBank(deck.deckId);
      setDecks((current) => current.filter((item) => item.deckId !== deck.deckId));
      toast({ title: "Uploaded deck deleted" });
      setDeckPendingDelete(null);
    } catch (error) {
      toast({
        title: "Could not delete uploaded deck",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeletingDeckId(null);
    }
  };

  return (
    <div className="w-full overflow-x-hidden px-3 py-4 sm:px-4 sm:py-6 lg:px-6 xl:px-8">
      <div className="w-full max-w-none space-y-4">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <p className="admin-kicker">Uploads</p>
              <h1 className="text-[1.45rem] font-semibold tracking-tight text-foreground sm:text-2xl">Your Uploaded Decks</h1>
              <p className="max-w-xl text-sm leading-5 text-muted-foreground sm:leading-6">Open one deck to browse its words and save the ones you want into Library.</p>
            </div>
            <Button asChild variant="outline" className="h-10 rounded-xl sm:self-start">
              <Link to="/settings">Upload another deck</Link>
            </Button>
          </div>

          <div className="space-y-3 rounded-[1rem] border border-border/70 bg-muted/10 p-3 sm:rounded-[1.15rem]">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search uploaded decks" className="h-11 rounded-xl pl-10" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:flex-wrap">
              <DeckMetric label="Decks" value={String(decks.length)} icon={BookCopy} />
              <div className="hidden sm:block">
                <DeckMetric label="Words" value={String(sumBy(decks, (deck) => deck.totalEntries).toLocaleString())} icon={FolderOpen} />
              </div>
              <div className="hidden sm:block">
                <DeckMetric label="Audio" value={String(sumBy(decks, (deck) => deck.mediaCounts?.audio || 0).toLocaleString())} icon={Volume2} />
              </div>
              <div className="hidden sm:block">
                <DeckMetric label="Images" value={String(sumBy(decks, (deck) => deck.mediaCounts?.images || 0).toLocaleString())} icon={ImageIcon} />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[240px] items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading uploaded decks...
            </div>
          ) : filteredDecks.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[1.2rem] border border-dashed text-center">
              <AlertTriangle className="h-10 w-10 text-muted-foreground" />
              <h2 className="mt-4 text-xl font-semibold text-foreground">{decks.length ? "No uploaded deck matches" : "No uploaded decks yet"}</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                {decks.length ? "Try another search term." : "Upload an `.apkg` file in Settings and it will appear here."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
              {filteredDecks.map((deck) => (
                <article key={deck.deckId} className="group mx-auto w-full max-w-sm rounded-[1rem] border border-border/70 bg-card/95 p-2.5 shadow-[0_10px_24px_rgba(0,0,0,0.10)] sm:max-w-none sm:rounded-[1.25rem] sm:p-3">
                  <div className="space-y-3">
                    <Link
                      to={`/imported-deck/${deck.deckId}`}
                      className="relative block overflow-hidden rounded-[1rem] border border-border/70 bg-[linear-gradient(160deg,rgba(77,182,172,0.18),rgba(15,23,42,0.12)_38%,rgba(15,23,42,0.92)_100%)] p-3 transition-transform duration-200 group-hover:-translate-y-0.5 sm:rounded-[1.15rem] sm:p-4"
                    >
                      <div className="aspect-[16/10] sm:aspect-[3/4]">
                        <div className="flex h-full flex-col justify-between">
                          <div className="flex items-start justify-between gap-3">
                            <div className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70 backdrop-blur">
                              Deck
                            </div>
                            <div className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70 backdrop-blur">
                              {deck.totalEntries.toLocaleString()} words
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="h-px w-14 bg-white/20" />
                            <h2 className="line-clamp-3 text-[1rem] font-semibold leading-tight tracking-tight text-white sm:line-clamp-4 sm:text-[1.45rem]">
                              {deck.sourceLabel}
                            </h2>
                            <p className="text-[11px] leading-4 text-white/65 sm:text-xs sm:leading-5">
                              {deck.importedAt ? new Date(deck.importedAt).toLocaleDateString() : "Unknown upload time"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Link>

                    <div className="grid grid-cols-3 gap-2">
                      <MiniStat label="Words" value={deck.totalEntries.toLocaleString()} />
                      <MiniStat label="Audio" value={String(deck.mediaCounts?.audio || 0)} />
                      <MiniStat label="Images" value={String(deck.mediaCounts?.images || 0)} />
                    </div>

                    <div className="flex gap-2">
                      <Button asChild className="h-8 flex-1 rounded-xl text-sm sm:h-9">
                        <Link to={`/imported-deck/${deck.deckId}`}>
                          <FolderOpen className="h-4 w-4" />
                          Open
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 rounded-xl px-3 text-destructive hover:bg-destructive/10 sm:h-9"
                        onClick={() => setDeckPendingDelete(deck)}
                        disabled={deletingDeckId === deck.deckId}
                      >
                        {deletingDeckId === deck.deckId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
      <DeleteConfirmDialog
        open={Boolean(deckPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingDeckId) {
            setDeckPendingDelete(null);
          }
        }}
        onConfirm={() => {
          if (deckPendingDelete) {
            void handleDelete(deckPendingDelete);
          }
        }}
        title="Delete uploaded deck?"
        description={deckPendingDelete ? `Delete "${deckPendingDelete.sourceLabel}" and all extracted media from your uploads?` : ""}
        confirmLabel="Delete deck"
        isPending={Boolean(deletingDeckId)}
      />
    </div>
  );
}

function DeckMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof FolderOpen;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-2 text-xs sm:rounded-full sm:text-sm">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground sm:h-4 sm:w-4" />
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="truncate font-semibold text-foreground">{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[0.8rem] border border-border/70 bg-muted/15 px-2.5 py-2 sm:rounded-[0.9rem] sm:px-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs font-semibold text-foreground sm:text-sm">{value}</p>
    </div>
  );
}

function sumBy<T>(items: T[], selector: (item: T) => number) {
  return items.reduce((sum, item) => sum + selector(item), 0);
}

const LAST_OPENED_IMPORTED_DECK_KEY = "lingowatch-last-opened-imported-deck";
