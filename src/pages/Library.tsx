import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, PlusCircle, Star, BookOpen, Trash2, CheckCircle2, Heart, BookText } from "lucide-react";
import { categories } from "@/lib/mockData";
import { PhraseType } from "@/types";
import { getReviewStage } from "@/lib/review";
import { generateStory } from "@/lib/ai";
import { useToast } from "@/hooks/use-toast";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

type SortOption = "newest" | "oldest" | "alphabetical" | "review_due" | "hardest";
type FilterStatus = "all" | "learned" | "not_learned" | "favorite";

export default function LibraryPage() {
  const { phrases, bulkDeletePhrases, bulkUpdatePhrases } = usePhraseStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [makingStory, setMakingStory] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | PhraseType>("all");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const filtered = useMemo(() => {
    let result = [...phrases];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.phraseText.toLowerCase().includes(q) ||
          p.notes.toLowerCase().includes(q) ||
          p.explanation?.easyMeaning.toLowerCase().includes(q) ||
          p.explanation?.standardMeaning.toLowerCase().includes(q) ||
          p.explanation?.aiExplanation.toLowerCase().includes(q) ||
          p.explanation?.somaliMeaning.toLowerCase().includes(q) ||
          p.explanation?.somaliExplanation.toLowerCase().includes(q) ||
          p.explanation?.somaliSentence.toLowerCase().includes(q) ||
          p.explanation?.usageContext.toLowerCase().includes(q) ||
          p.explanation?.commonMistake.toLowerCase().includes(q) ||
          p.explanation?.relatedPhrases.some((item) => item.toLowerCase().includes(q)) ||
          p.examples?.some((example) => example.exampleText.toLowerCase().includes(q))
      );
    }

    if (categoryFilter !== "all") result = result.filter((p) => p.category === categoryFilter);
    if (typeFilter !== "all") result = result.filter((p) => p.phraseType === typeFilter);
    if (statusFilter === "learned") result = result.filter((p) => p.isLearned);
    if (statusFilter === "not_learned") result = result.filter((p) => !p.isLearned);
    if (statusFilter === "favorite") result = result.filter((p) => p.isFavorite);

    result.sort((a, b) => {
      if (sortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === "review_due") return new Date(a.review?.nextReviewAt ?? a.createdAt).getTime() - new Date(b.review?.nextReviewAt ?? b.createdAt).getTime();
      if (sortBy === "hardest") return (a.review?.confidenceScore ?? 0) - (b.review?.confidenceScore ?? 0);
      return a.phraseText.localeCompare(b.phraseText);
    });

    return result;
  }, [phrases, search, categoryFilter, typeFilter, statusFilter, sortBy]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((phrase) => selectedIds.includes(phrase.id));
  const selectedCount = selectedIds.length;

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const handleSelectAllVisible = (checked: boolean) => {
    setSelectedIds(checked ? filtered.map((phrase) => phrase.id) : []);
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    setIsDeleting(true);
    try {
      await bulkDeletePhrases(selectedIds);
      setSelectedIds([]);
      setShowDeleteDialog(false);
      toast({
        title: selectedIds.length === 1 ? "Phrase deleted" : "Phrases deleted",
        description: `${selectedIds.length} ${selectedIds.length === 1 ? "entry was" : "entries were"} removed.`,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkFavorite = () => {
    if (!selectedIds.length) return;
    bulkUpdatePhrases(selectedIds, { isFavorite: true });
    setSelectedIds([]);
  };

  const handleBulkLearned = () => {
    if (!selectedIds.length) return;
    bulkUpdatePhrases(selectedIds, { isLearned: true });
    setSelectedIds([]);
  };

  const handleMakeStory = async () => {
    if (!selectedIds.length) return;
    const words = phrases.filter((p) => selectedIds.includes(p.id)).map((p) => p.phraseText);
    setMakingStory(true);
    try {
      const { title, content } = await generateStory(words);
      const stored = JSON.parse(localStorage.getItem("lingowatch_stories") || "[]");
      const entry = { id: crypto.randomUUID(), title, words, content, createdAt: new Date().toISOString() };
      localStorage.setItem("lingowatch_stories", JSON.stringify([entry, ...stored]));
      setSelectedIds([]);
      navigate("/stories");
    } catch (error) {
      toast({ title: "Could not generate story", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    } finally {
      setMakingStory(false);
    }
  };

  return (
    <div className="app-page">
      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleBulkDelete}
        isPending={isDeleting}
        title={selectedCount === 1 ? "Delete this phrase?" : `Delete ${selectedCount} phrases?`}
        description="This will permanently remove the selected entries."
        confirmLabel="Delete"
      />
      <div className="page-stack">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="admin-kicker">Library</p>
            <h1 className="admin-page-title">Your Phrase Library</h1>
            <p className="admin-page-subtitle">{phrases.length} phrases saved</p>
          </div>
          <Link to="/add-phrase">
            <Button className="h-11 gap-2 rounded-xl px-5">
              <PlusCircle className="h-4 w-4" /> Add Phrase
            </Button>
          </Link>
        </div>

        <div className="admin-toolbar">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search phrases, meanings, notes..." className="h-11 rounded-xl pl-10" />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-11 w-full rounded-xl sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | PhraseType)}>
            <SelectTrigger className="h-11 w-full rounded-xl sm:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="word">Word</SelectItem>
              <SelectItem value="phrase">Phrase</SelectItem>
              <SelectItem value="phrasal_verb">Phrasal Verb</SelectItem>
              <SelectItem value="idiom">Idiom</SelectItem>
              <SelectItem value="expression">Expression</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as FilterStatus)}>
            <SelectTrigger className="h-11 w-full rounded-xl sm:w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="learned">Learned</SelectItem>
              <SelectItem value="not_learned">Not Learned</SelectItem>
              <SelectItem value="favorite">Favorites</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="h-11 w-full rounded-xl sm:w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="alphabetical">A-Z</SelectItem>
              <SelectItem value="review_due">Next Review</SelectItem>
              <SelectItem value="hardest">Hardest</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedCount > 0 ? (
          <div className="admin-toolbar">
            <p className="text-sm font-medium text-foreground">{selectedCount} selected</p>
            <Button variant="outline" className="h-11 rounded-xl" onClick={handleBulkFavorite}>
              <Heart className="h-4 w-4" /> Favorite
            </Button>
            <Button variant="outline" className="h-11 rounded-xl" onClick={handleBulkLearned}>
              <CheckCircle2 className="h-4 w-4" /> Mark Learned
            </Button>
            <Button variant="outline" className="h-11 rounded-xl" onClick={handleMakeStory} disabled={makingStory}>
              <BookText className="h-4 w-4" /> {makingStory ? "Generating..." : "Make Story"}
            </Button>
            <Button variant="outline" className="h-11 rounded-xl text-destructive hover:bg-destructive/10" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        ) : null}

        <div className="admin-panel overflow-hidden">
          <div className="workspace-section-header">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">Results</p>
              <h2 className="mt-1 text-xl font-semibold text-white">{filtered.length} entries</h2>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-10 text-center">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
              <h3 className="mt-3 font-semibold text-foreground">
                {phrases.length === 0 ? "No phrases yet" : "No phrases match your filters"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {phrases.length === 0 ? "Add your first phrase to get started." : "Try adjusting your filters."}
              </p>
            </div>
          ) : (
            <div>
              <div className="workspace-table-head hidden lg:grid lg:grid-cols-[40px_minmax(0,1.5fr)_140px_120px_140px]">
                <div className="flex items-center">
                  <Checkbox checked={allVisibleSelected} onCheckedChange={(checked) => handleSelectAllVisible(checked === true)} />
                </div>
                <span>Phrase</span>
                <span>Category</span>
                <span>Difficulty</span>
                <span>Status</span>
              </div>
              {filtered.map((phrase) => (
                <div key={phrase.id} className="admin-list-row">
                  <div className="flex items-start gap-3 lg:grid lg:w-full lg:grid-cols-[40px_minmax(0,1.5fr)_140px_120px_140px] lg:items-center lg:gap-3">
                    <div className="pt-1 lg:pt-0">
                      <Checkbox checked={selectedIds.includes(phrase.id)} onCheckedChange={() => toggleSelection(phrase.id)} />
                    </div>
                    <Link to={`/phrase/${phrase.id}`} className="min-w-0">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="admin-chip">{phrase.phraseType.replace("_", " ")}</span>
                          {phrase.review ? (
                            <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
                              {getReviewStage(phrase.review)}
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-2 text-xl font-semibold text-foreground">{phrase.phraseText}</h3>
                        <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-muted-foreground">{phrase.explanation?.easyMeaning}</p>
                      </div>
                    </Link>
                    <div className="mt-3 text-sm text-muted-foreground lg:mt-0 lg:text-foreground">{phrase.category}</div>
                    <div className="text-sm text-muted-foreground lg:text-foreground">{phrase.difficultyLevel}</div>
                    <div className="flex items-center gap-2 lg:justify-start">
                      {phrase.isFavorite && <Star className="h-4 w-4 fill-accent text-accent" />}
                      {phrase.isLearned && <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Learned</span>}
                      {phrase.review?.nextReviewAt ? (
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                          {new Date(phrase.review.nextReviewAt).toLocaleDateString()}
                        </span>
                      ) : null}
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
