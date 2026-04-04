import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BookText, Trash2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StoryEntry {
  id: string;
  title: string;
  words: string[];
  content: string;
  createdAt: string;
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

export default function StoriesPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [stories, setStories] = useState<StoryEntry[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem("lingowatch_stories");
    if (raw) setStories(JSON.parse(raw));
  }, []);

  const saveStories = (updated: StoryEntry[]) => {
    setStories(updated);
    localStorage.setItem("lingowatch_stories", JSON.stringify(updated));
  };

  const handleDelete = (storyId: string) => {
    saveStories(stories.filter((s) => s.id !== storyId));
    if (id) navigate("/stories");
  };

  // Reading view
  if (id) {
    const story = stories.find((s) => s.id === id);
    if (!story) return null;
    return (
      <ReadingView
        story={story}
        onBack={() => navigate("/stories")}
        onDelete={() => handleDelete(story.id)}
      />
    );
  }

  // List view — book cards
  return (
    <div className="app-page">
      <div className="page-stack">
        <div>
          <p className="admin-kicker">Learning</p>
          <h1 className="admin-page-title">Stories</h1>
          <p className="admin-page-subtitle">
            {stories.length === 0 ? "No stories yet" : `${stories.length} ${stories.length === 1 ? "story" : "stories"}`}
          </p>
        </div>

        {stories.length === 0 ? (
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
                onDelete={(e) => { e.stopPropagation(); handleDelete(story.id); }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
