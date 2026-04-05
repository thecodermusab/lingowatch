import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BookText, Trash2, ArrowLeft, Globe, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

interface StoryEntry {
  id: string;
  title: string;
  words: string[];
  content: string;
  createdAt: string;
}

interface WorldStory {
  id: string;
  slug: string;
  title: string;
  coverUrl: string;
  content: string;
  images: string[];
  source: string;
  sourceUrl: string;
}

function renderContent(content: string) {
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-primary">{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function BookCard({ story, onClick, onDelete }: { story: StoryEntry; onClick: () => void; onDelete: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:shadow-md hover:-translate-y-1"
      style={{ width: 180, height: 240 }}
      onClick={onClick}
    >
      {/* Book spine accent */}
      <div className="absolute left-0 top-0 h-full w-1.5 bg-primary/60 rounded-l-2xl" />

      {/* Cover */}
      <div className="flex flex-1 flex-col justify-between p-5 pl-6">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {new Date(story.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
          <h3 className="mt-2 text-sm font-bold leading-snug text-foreground line-clamp-3">
            {story.title || "Untitled Story"}
          </h3>
        </div>
        <div className="flex flex-wrap gap-1">
          {story.words.slice(0, 3).map((w) => (
            <span key={w} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {w}
            </span>
          ))}
          {story.words.length > 3 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              +{story.words.length - 3}
            </span>
          )}
        </div>
      </div>

      {/* Delete button */}
      <button
        type="button"
        className="absolute right-2 top-2 rounded-lg p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function WorldBookCard({ story, onClick }: { story: WorldStory; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);
  return (
    <div
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:shadow-md hover:-translate-y-1"
      style={{ width: 180, height: 240 }}
      onClick={onClick}
    >
      {/* Cover image */}
      {!imgError ? (
        <img
          src={story.coverUrl}
          alt={story.title}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-muted p-4">
          <Globe className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-xs font-semibold text-center text-foreground leading-snug">{story.title}</p>
        </div>
      )}

      {/* Title overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
        <p className="text-xs font-semibold text-white leading-snug line-clamp-2">{story.title}</p>
      </div>
    </div>
  );
}

function ReadingView({ story, onBack, onDelete }: { story: StoryEntry; onBack: () => void; onDelete: () => void }) {
  return (
    <div className="app-page">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <button
          type="button"
          onClick={onBack}
          className="mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Stories
        </button>

        <article>
          <header className="mb-8 text-center">
            <div className="mb-3 flex flex-wrap justify-center gap-2">
              {story.words.map((w) => (
                <span key={w} className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary">
                  {w}
                </span>
              ))}
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{story.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {new Date(story.createdAt).toLocaleDateString(undefined, { dateStyle: "long" })}
            </p>
          </header>

          <div className="prose prose-lg mx-auto max-w-none text-center">
            <p className="text-lg leading-relaxed text-foreground/90">
              {renderContent(story.content)}
            </p>
          </div>
        </article>

        <div className="mt-12 flex justify-center">
          <Button variant="outline" size="sm" className="gap-2 text-destructive hover:bg-destructive/10" onClick={onDelete}>
            <Trash2 className="h-4 w-4" /> Delete story
          </Button>
        </div>
      </div>
    </div>
  );
}

const PARAS_PER_PAGE = 3;

function WorldReadingView({ story, allStories, onBack, onSelect }: {
  story: WorldStory;
  allStories: WorldStory[];
  onBack: () => void;
  onSelect: (s: WorldStory) => void;
}) {
  const [page, setPage] = useState(0);
  const [finished, setFinished] = useState(false);

  const paragraphs = story.content.split(/\n\n+/).filter((p) => p.trim() !== "*" && p.trim() !== "");

  // Group paragraphs into pages
  const pages: string[][] = [];
  for (let i = 0; i < paragraphs.length; i += PARAS_PER_PAGE) {
    pages.push(paragraphs.slice(i, i + PARAS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);

  const totalPages = pages.length;

  // Pick 6 random recommendations excluding current story
  const recommended = allStories
    .filter((s) => s.id !== story.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 6);

  useEffect(() => {
    setPage(0);
    setFinished(false);
  }, [story.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished) {
        if (e.key === "Escape" || e.key === "Backspace") onBack();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        if (page === totalPages - 1) setFinished(true);
        else setPage((p) => p + 1);
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") setPage((p) => Math.max(0, p - 1));
      if (e.key === "Escape" || e.key === "Backspace") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [totalPages, page, finished]);

  // Left-side image: cover on page 0, cycle through story images on later pages
  const allImages = [story.coverUrl, ...story.images].filter(Boolean);
  const leftImage = allImages[page % allImages.length] || story.coverUrl;

  const goBack = () => {
    if (finished) { setFinished(false); return; }
    setPage((p) => Math.max(0, p - 1));
  };
  const goNext = () => {
    if (page === totalPages - 1) setFinished(true);
    else setPage((p) => p + 1);
  };

  if (finished) {
    return (
      <div className="relative flex min-h-screen w-full flex-col bg-background">
        <div className="border-b border-border" />
        <div className="flex items-center justify-between px-8 pb-3 pt-32">
          <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <span className="text-sm text-muted-foreground font-medium">{story.title}</span>
          <div className="w-[60px]" />
        </div>
        <div className="w-full pb-2 text-center text-base tracking-widest text-muted-foreground/40 select-none">*</div>
        <div className="border-b border-border" />

        <div className="flex flex-1 flex-col items-center justify-center px-8 py-12">
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">Finished</p>
          <h2 className="mb-8 text-2xl font-bold text-foreground">{story.title}</h2>

          <p className="mb-6 text-sm text-muted-foreground">Read next</p>
          <div className="flex flex-wrap justify-center gap-5">
            {recommended.map((s) => (
              <div
                key={s.id}
                className="group cursor-pointer"
                onClick={() => { onSelect(s); }}
              >
                <div className="overflow-hidden rounded-xl shadow transition-all group-hover:-translate-y-1 group-hover:shadow-md" style={{ width: 140, height: 190 }}>
                  <img src={s.coverUrl} alt={s.title} className="h-full w-full object-cover" />
                </div>
                <p className="mt-2 max-w-[140px] text-center text-xs text-muted-foreground line-clamp-2">{s.title}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border" />
        <div className="w-full py-3 text-center text-xs text-muted-foreground/40 select-none">
          {totalPages} / {totalPages}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-background">
      {/* Top border */}
      <div className="border-b border-border" />

      {/* Top bar */}
      <div className="flex items-center justify-between px-8 pb-3 pt-32">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <span className="text-sm text-muted-foreground font-medium">{story.title}</span>
        <div className="w-[60px]" />
      </div>

      {/* * sits just below the top border line */}
      <div className="w-full pb-2 text-center text-base tracking-widest text-muted-foreground/40 select-none">*</div>

      {/* Border below * */}
      <div className="border-b border-border" />

      {/* Book spread */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* Left arrow */}
        <button
          type="button"
          onClick={goBack}
          disabled={page === 0}
          className="absolute left-0 top-0 h-full w-14 z-10 flex items-center justify-center text-4xl text-white/30 hover:text-white/70 disabled:opacity-0 transition-all"
        >
          ‹
        </button>

        {/* Left panel — image side */}
        <div className="flex w-2/5 flex-col items-center justify-center gap-6 px-12 py-8">
          {page === 0 && (
            <div className="text-center">
              <h1 className="text-3xl font-bold text-white">{story.title}</h1>
              <p className="mt-2 text-sm text-white/50">An English Story</p>
            </div>
          )}
          {leftImage && (
            <img
              src={leftImage}
              alt=""
              className={`object-contain shadow-lg ${page === 0 ? "max-h-52 rounded-xl" : "max-h-72 rounded-xl"}`}
            />
          )}
        </div>

        {/* Divider */}
        <div className="w-px bg-white/10 self-stretch my-8" />

        {/* Right panel — text side */}
        <div className="flex w-3/5 flex-col justify-center overflow-y-auto px-12 py-8 pr-16">
          {pages[page]?.map((para, i) => (
            <p key={i} className="mb-6 text-[1.1rem] leading-[1.85] text-white/90">
              {para}
            </p>
          ))}
        </div>

        {/* Right arrow — on last page still enabled to go to end screen */}
        <button
          type="button"
          onClick={goNext}
          className="absolute right-0 top-0 h-full w-14 z-10 flex items-center justify-center text-4xl text-muted-foreground/30 hover:text-foreground/70 transition-all"
        >
          ›
        </button>
      </div>

      {/* Border above page counter */}
      <div className="border-t border-border" />

      {/* Page counter */}
      <div className="w-full py-3 text-center text-xs text-muted-foreground/40 select-none">
        {page + 1} / {totalPages}
      </div>
    </div>
  );
}

export default function StoriesPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [stories, setStories] = useState<StoryEntry[]>([]);
  const [storyToDelete, setStoryToDelete] = useState<StoryEntry | null>(null);
  const [worldStories, setWorldStories] = useState<WorldStory[]>([]);
  const [worldLoading, setWorldLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"mine" | "browse">("mine");
  const [selectedWorld, setSelectedWorld] = useState<WorldStory | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("lingowatch_stories");
    if (raw) setStories(JSON.parse(raw));
  }, []);

  useEffect(() => {
    if (activeTab !== "browse" || worldStories.length > 0) return;
    setWorldLoading(true);
    fetch("/api/world-stories")
      .then((r) => r.json())
      .then((data) => setWorldStories(Array.isArray(data) ? data : []))
      .catch(() => setWorldStories([]))
      .finally(() => setWorldLoading(false));
  }, [activeTab, worldStories.length]);

  const saveStories = (updated: StoryEntry[]) => {
    setStories(updated);
    localStorage.setItem("lingowatch_stories", JSON.stringify(updated));
  };

  const handleDelete = (storyId: string) => {
    saveStories(stories.filter((s) => s.id !== storyId));
    if (id) navigate("/stories");
  };

  // World story reading view
  if (selectedWorld) {
    return (
      <WorldReadingView
        story={selectedWorld}
        allStories={worldStories}
        onBack={() => setSelectedWorld(null)}
        onSelect={(s) => setSelectedWorld(s)}
      />
    );
  }

  // User story reading view
  if (id) {
    const story = stories.find((s) => s.id === id);
    if (!story) return null;
    return (
      <>
        <DeleteConfirmDialog
          open={Boolean(storyToDelete)}
          onOpenChange={(open) => { if (!open) setStoryToDelete(null); }}
          onConfirm={() => {
            if (!storyToDelete) return;
            handleDelete(storyToDelete.id);
            setStoryToDelete(null);
          }}
          title="Delete this story?"
          description="This story will be removed from your reading list."
        />
        <ReadingView
          story={story}
          onBack={() => navigate("/stories")}
          onDelete={() => setStoryToDelete(story)}
        />
      </>
    );
  }

  // List view
  return (
    <div className="app-page">
      <DeleteConfirmDialog
        open={Boolean(storyToDelete)}
        onOpenChange={(open) => { if (!open) setStoryToDelete(null); }}
        onConfirm={() => {
          if (!storyToDelete) return;
          handleDelete(storyToDelete.id);
          setStoryToDelete(null);
        }}
        title="Delete this story?"
        description="This story will be removed from your reading list."
      />
      <div className="page-stack">
        <div>
          <p className="admin-kicker">Learning</p>
          <h1 className="admin-page-title">Stories</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          <button
            type="button"
            onClick={() => setActiveTab("mine")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "mine"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            My Stories
            {stories.length > 0 && (
              <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{stories.length}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("browse")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "browse"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            Browse
            {worldStories.length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{worldStories.length}</span>
            )}
          </button>
        </div>

        {/* My Stories tab */}
        {activeTab === "mine" && (
          stories.length === 0 ? (
            <div className="admin-panel admin-panel-body flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <BookText className="h-10 w-10 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">No stories yet</h3>
              <p className="text-sm text-muted-foreground">
                Go to your Library, select some words, and click "Make Story".
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-5">
              {stories.map((story) => (
                <BookCard
                  key={story.id}
                  story={story}
                  onClick={() => navigate(`/stories/${story.id}`)}
                  onDelete={(e) => { e.stopPropagation(); setStoryToDelete(story); }}
                />
              ))}
            </div>
          )
        )}

        {/* Browse tab */}
        {activeTab === "browse" && (
          worldLoading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <p className="text-sm text-muted-foreground">Loading stories...</p>
            </div>
          ) : worldStories.length === 0 ? (
            <div className="admin-panel admin-panel-body flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <Globe className="h-10 w-10 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">No stories loaded</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Run <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run scrape:stories</code> to import stories from worldstories.org.uk.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-5">
              {worldStories.map((story) => (
                <WorldBookCard
                  key={story.id}
                  story={story}
                  onClick={() => setSelectedWorld(story)}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
