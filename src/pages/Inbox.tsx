import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, CheckCircle2, ExternalLink, Inbox, Loader2, PlusCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { getInboxCaptures, InboxCapture, updateInboxCapture } from "@/lib/inbox";
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
      badge: "border-emerald-400/20 bg-emerald-400/12 text-emerald-200",
      card: "border-emerald-400/18 bg-[#131c19]",
      accent: "from-emerald-400/18 to-transparent",
    };
  }

  if (status === "archived") {
    return {
      badge: "border-white/10 bg-white/[0.05] text-white/72",
      card: "border-white/10 bg-[#141920]",
      accent: "from-white/8 to-transparent",
    };
  }

  return {
    badge: "border-amber-300/20 bg-amber-300/12 text-amber-200",
    card: "border-violet-400/20 bg-[#171a24]",
    accent: "from-violet-400/16 to-transparent",
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

        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#11161f] shadow-[0_30px_80px_rgba(3,8,20,0.3)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.14),transparent_48%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.1),transparent_44%)]" />
          <div className="workspace-section-header relative z-10">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">Shared Capture</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Extension saves</h2>
            </div>
            <Button variant="outline" className="h-10 rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => void loadInbox()}>
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
                  className={`group relative flex min-h-[250px] flex-col overflow-hidden rounded-[28px] border p-5 shadow-[0_20px_55px_rgba(3,8,20,0.28)] ${getStatusStyles(capture.status).card}`}
                >
                  <div className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br ${getStatusStyles(capture.status).accent}`} />

                  <div className="relative z-10 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getStatusStyles(capture.status).badge}`}>
                          {capture.status}
                        </span>
                        {capture.sourceHost ? (
                          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/58">
                            {formatCaptureHost(capture.sourceHost)}
                          </span>
                        ) : null}
                        {formatCaptureTimestamp(capture.timestampSeconds) ? (
                          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/58">
                            {formatCaptureTimestamp(capture.timestampSeconds)}
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mt-3 text-[2rem] font-semibold tracking-tight text-white">
                        {capture.displayWord || capture.word}
                      </h3>
                      {capture.translation ? (
                        <p className="mt-2 text-xl font-semibold text-amber-300">{capture.translation}</p>
                      ) : (
                        <p className="mt-2 text-sm text-white/42">No Somali meaning yet</p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {capture.sourceUrl ? (
                        <a
                          href={capture.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/72 transition hover:border-white/18 hover:bg-white/[0.1] hover:text-white"
                          aria-label="Open source"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : null}

                      {capture.status !== "archived" ? (
                        <button
                          type="button"
                          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/58 transition hover:border-white/18 hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
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
                    <div className="relative z-10 mt-4 rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/36">From subtitle</p>
                      <p className="mt-2 line-clamp-2 text-sm italic leading-6 text-slate-200/88">
                        {capture.sentenceContext}
                      </p>
                    </div>
                  ) : null}

                  {getDisplayNote(capture) ? (
                    <p className="relative z-10 mt-3 line-clamp-2 text-sm leading-6 text-white/64">{getDisplayNote(capture)}</p>
                  ) : null}

                  <div className="relative z-10 mt-auto pt-5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-white/48">
                      <span>{formatDistanceToNow(new Date(capture.createdAt), { addSuffix: true })}</span>
                      {capture.sourceTitle ? <span className="line-clamp-1 max-w-full">{capture.sourceTitle}</span> : null}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {capture.status !== "imported" ? (
                        <Button
                          className="h-11 rounded-2xl bg-white text-slate-950 shadow-none transition hover:bg-white/92"
                          disabled={busyId === capture.id}
                          onClick={() => void handleAddToLibrary(capture)}
                        >
                          {busyId === capture.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                          Add to library
                        </Button>
                      ) : capture.importedPhraseId ? (
                        <Link to={`/phrase/${capture.importedPhraseId}`}>
                          <Button className="h-11 rounded-2xl bg-emerald-300 text-emerald-950 shadow-none transition hover:bg-emerald-200">
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Open phrase
                          </Button>
                        </Link>
                      ) : (
                        <div className="inline-flex h-11 items-center rounded-2xl border border-emerald-300/18 bg-emerald-300/10 px-4 text-sm font-medium text-emerald-200">
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
