import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, CheckCircle2, ExternalLink, Inbox, Loader2, PlusCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { getInboxCaptures, InboxCapture, updateInboxCapture } from "@/lib/data/inbox";
import { Button } from "@/components/ui/button";

function inferDifficulty(word: string) {
  if (word.length <= 5) return "beginner" as const;
  if (word.length >= 10) return "advanced" as const;
  return "intermediate" as const;
}

function buildCaptureNotes(capture: InboxCapture) {
  const parts = [
    capture.note,
    capture.sentenceContext ? `Context: ${capture.sentenceContext}` : "",
    capture.sourceTitle ? `Title: ${capture.sourceTitle}` : "",
    capture.sourceUrl ? `URL: ${capture.sourceUrl}` : "",
    capture.timestampSeconds != null ? `Timestamp: ${capture.timestampSeconds}s` : "",
  ].filter(Boolean);

  return parts.join("\n");
}

function formatCaptureHost(host: string) {
  return host.replace(/^www\./i, "");
}

function formatCaptureTimestamp(seconds: number | null) {
  if (seconds == null || Number.isNaN(seconds)) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function getDisplayNote(capture: InboxCapture) {
  const note = capture.note.trim();
  const autoNote = capture.sentenceContext ? `From subtitle: ${capture.sentenceContext}` : "";
  if (!note || note === autoNote) {
    return "";
  }

  return note;
}

function getStatusStyles(status: InboxCapture["status"]) {
  if (status === "imported") {
    return {
      badge: "border-success/25 bg-success/10 text-success",
      card: "border-success/25 bg-card/95",
      accent: "from-success/20 via-success/6 to-transparent",
    };
  }

  if (status === "archived") {
    return {
      badge: "border-border bg-secondary/55 text-muted-foreground",
      card: "border-border bg-card/95",
      accent: "from-secondary/65 via-secondary/20 to-transparent",
    };
  }

  return {
    badge: "border-accent/25 bg-accent/15 text-accent",
    card: "border-accent/25 bg-card/95",
    accent: "from-accent/22 via-accent/7 to-transparent",
  };
}

export default function InboxPage() {
  const { toast } = useToast();
  const { addPhrase } = usePhraseStore();
  const [captures, setCaptures] = useState<InboxCapture[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<"new" | "imported" | "archived" | "all">("new");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadInbox() {
    setLoading(true);
    try {
      const data = await getInboxCaptures();
      setCaptures(data);
    } catch (error) {
      toast({
        title: "Could not load inbox",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInbox();
  }, []);

  const filteredCaptures = useMemo(() => {
    if (activeFilter === "all") return captures;
    return captures.filter((capture) => capture.status === activeFilter);
  }, [captures, activeFilter]);

  const counts = useMemo(
    () => ({
      all: captures.length,
      new: captures.filter((capture) => capture.status === "new").length,
      imported: captures.filter((capture) => capture.status === "imported").length,
      archived: captures.filter((capture) => capture.status === "archived").length,
    }),
    [captures]
  );

  async function handleAddToLibrary(capture: InboxCapture) {
    setBusyId(capture.id);
    try {
      const phrase = await addPhrase({
        phraseText: capture.displayWord || capture.word,
        phraseType: "word",
        category: "Learning",
        notes: buildCaptureNotes(capture),
        difficultyLevel: inferDifficulty(capture.word),
      });

      await updateInboxCapture(capture.id, {
        status: "imported",
        importedPhraseId: phrase.id,
      });

      setCaptures((prev) =>
        prev.map((item) =>
          item.id === capture.id ? { ...item, status: "imported", importedPhraseId: phrase.id } : item
        )
      );

      toast({
        title: "Added to library",
        description: `"${capture.displayWord || capture.word}" is ready in Lingowatch.`,
      });
    } catch (error) {
      toast({
        title: "Could not import capture",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleArchive(capture: InboxCapture) {
    setBusyId(capture.id);
    try {
      await updateInboxCapture(capture.id, { status: "archived" });
      setCaptures((prev) => prev.map((item) => (item.id === capture.id ? { ...item, status: "archived" } : item)));
    } catch (error) {
      toast({
        title: "Could not archive capture",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="app-page">
      <div className="page-stack max-w-6xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="admin-kicker">Capture</p>
            <h1 className="admin-page-title">Lingowatch Inbox</h1>
            <p className="admin-page-subtitle">
              Words saved from the extension appear here. Review them, import them, or archive them.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["new", "imported", "archived", "all"] as const).map((filter) => (
              <Button
                key={filter}
                variant={activeFilter === filter ? "default" : "outline"}
                className="h-10 rounded-xl"
                onClick={() => setActiveFilter(filter)}
              >
                {filter === "all" ? "All" : filter.charAt(0).toUpperCase() + filter.slice(1)} ({counts[filter]})
              </Button>
            ))}
          </div>
        </div>

        <div className="admin-panel relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-accent/20 via-primary/10 to-transparent" />
          <div className="workspace-section-header relative z-10">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">Shared Capture</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Extension saves</h2>
            </div>
            <Button variant="outline" className="h-10 rounded-xl" onClick={() => void loadInbox()}>
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="flex min-h-[260px] items-center justify-center p-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading inbox...
            </div>
          ) : filteredCaptures.length === 0 ? (
            <div className="p-10 text-center">
              <Inbox className="mx-auto h-10 w-10 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">No captures here yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Save words from the Lingowatch extension and they will show up here.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-2">
              {filteredCaptures.map((capture) => (
                <div
                  key={capture.id}
                  className={`group relative flex min-h-[250px] flex-col overflow-hidden rounded-[1.5rem] border p-5 shadow-[0_16px_34px_rgba(0,0,0,0.2)] ${getStatusStyles(capture.status).card}`}
                >
                  <div className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br ${getStatusStyles(capture.status).accent}`} />

                  <div className="relative z-10 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getStatusStyles(capture.status).badge}`}>
                          {capture.status}
                        </span>
                        {capture.sourceHost ? (
                          <span className="rounded-full bg-secondary/65 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                            {formatCaptureHost(capture.sourceHost)}
                          </span>
                        ) : null}
                        {formatCaptureTimestamp(capture.timestampSeconds) ? (
                          <span className="rounded-full bg-secondary/65 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                            {formatCaptureTimestamp(capture.timestampSeconds)}
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mt-3 text-[2rem] font-semibold tracking-tight text-foreground">
                        {capture.displayWord || capture.word}
                      </h3>
                      {capture.translation ? (
                        <p className="mt-2 text-xl font-semibold text-primary">{capture.translation}</p>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">No Somali meaning yet</p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {capture.sourceUrl ? (
                        <a
                          href={capture.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-secondary/40 text-muted-foreground transition hover:border-border hover:bg-secondary/70 hover:text-foreground"
                          aria-label="Open source"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : null}

                      {capture.status !== "archived" ? (
                        <button
                          type="button"
                          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-secondary/40 text-muted-foreground transition hover:border-border hover:bg-secondary/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={busyId === capture.id}
                          onClick={() => void handleArchive(capture)}
                          aria-label="Archive capture"
                        >
                          {busyId === capture.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {capture.sentenceContext ? (
                    <div className="relative z-10 mt-4 rounded-[1.2rem] border border-border bg-secondary/35 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">From subtitle</p>
                      <p className="mt-2 line-clamp-2 text-sm italic leading-6 text-foreground/88">
                        {capture.sentenceContext}
                      </p>
                    </div>
                  ) : null}

                  {getDisplayNote(capture) ? (
                    <p className="relative z-10 mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{getDisplayNote(capture)}</p>
                  ) : null}

                  <div className="relative z-10 mt-auto pt-5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-muted-foreground">
                      <span>{formatDistanceToNow(new Date(capture.createdAt), { addSuffix: true })}</span>
                      {capture.sourceTitle ? <span className="line-clamp-1 max-w-full">{capture.sourceTitle}</span> : null}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {capture.status !== "imported" ? (
                        <Button
                          className="h-11 rounded-2xl"
                          disabled={busyId === capture.id}
                          onClick={() => void handleAddToLibrary(capture)}
                        >
                          {busyId === capture.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                          Add to library
                        </Button>
                      ) : capture.importedPhraseId ? (
                        <Link to={`/phrase/${capture.importedPhraseId}`}>
                          <Button className="h-11 rounded-2xl bg-success/20 text-success shadow-none transition hover:bg-success/30">
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Open phrase
                          </Button>
                        </Link>
                      ) : (
                        <div className="inline-flex h-11 items-center rounded-2xl border border-success/25 bg-success/10 px-4 text-sm font-medium text-success">
                          Imported
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
