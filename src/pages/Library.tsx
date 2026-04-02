import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, PlusCircle, Star, BookOpen, Filter } from "lucide-react";
import { categories } from "@/lib/mockData";
import { PhraseType } from "@/types";

type SortOption = "newest" | "oldest" | "alphabetical";
type FilterStatus = "all" | "learned" | "not_learned" | "favorite";

export default function LibraryPage() {
  const { phrases } = usePhraseStore();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | PhraseType>("all");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let result = [...phrases];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.phraseText.toLowerCase().includes(q) ||
          p.notes.toLowerCase().includes(q) ||
          p.explanation?.easyMeaning.toLowerCase().includes(q) ||
          p.explanation?.standardMeaning.toLowerCase().includes(q)
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
      return a.phraseText.localeCompare(b.phraseText);
    });

    return result;
  }, [phrases, search, categoryFilter, typeFilter, statusFilter, sortBy]);

  return (
    <div className="container py-8">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Your Phrase Library</h1>
            <p className="text-muted-foreground">{phrases.length} phrases saved</p>
          </div>
          <Link to="/add-phrase">
            <Button className="gap-2"><PlusCircle className="h-4 w-4" /> Add Phrase</Button>
          </Link>
        </div>

        {/* Search + Filter Toggle */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search phrases, meanings, notes..." className="pl-10" />
          </div>
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="gap-2">
            <Filter className="h-4 w-4" /> Filters
          </Button>
        </div>

        {showFilters && (
          <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Type</label>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="word">Word</SelectItem>
                  <SelectItem value="phrase">Phrase</SelectItem>
                  <SelectItem value="phrasal_verb">Phrasal Verb</SelectItem>
                  <SelectItem value="idiom">Idiom</SelectItem>
                  <SelectItem value="expression">Expression</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as FilterStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="learned">Learned</SelectItem>
                  <SelectItem value="not_learned">Not Learned</SelectItem>
                  <SelectItem value="favorite">Favorites</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Sort</label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="alphabetical">A → Z</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Phrase List */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border bg-card p-10 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
            <h3 className="mt-3 font-semibold text-foreground">
              {phrases.length === 0 ? "No phrases yet" : "No phrases match your filters"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {phrases.length === 0 ? "Add your first phrase to get started!" : "Try adjusting your search or filters"}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((phrase) => (
              <Link key={phrase.id} to={`/phrase/${phrase.id}`} className="group rounded-2xl border bg-card p-5 transition-all hover:shadow-md">
                <div className="flex items-start justify-between">
                  <span className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {phrase.phraseType.replace("_", " ")}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {phrase.isFavorite && <Star className="h-4 w-4 fill-accent text-accent" />}
                    {phrase.isLearned && <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">✓</span>}
                  </div>
                </div>
                <h3 className="mt-2 text-lg font-semibold text-foreground group-hover:text-primary">{phrase.phraseText}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{phrase.explanation?.easyMeaning}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{phrase.category}</span>
                  <span className="text-xs text-muted-foreground">{phrase.difficultyLevel}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
