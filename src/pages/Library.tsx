import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, PlusCircle, Star, BookOpen } from "lucide-react";
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
    <div className="app-page">
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
            </SelectContent>
          </Select>
        </div>

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
              <div className="workspace-table-head hidden lg:grid lg:grid-cols-[minmax(0,1.5fr)_140px_120px_120px]">
                <span>Phrase</span>
                <span>Category</span>
                <span>Difficulty</span>
                <span>Status</span>
              </div>
              {filtered.map((phrase) => (
                <Link key={phrase.id} to={`/phrase/${phrase.id}`} className="admin-list-row block">
                  <div className="min-w-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1.5fr)_140px_120px_120px] lg:items-center lg:gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="admin-chip">{phrase.phraseType.replace("_", " ")}</span>
                      </div>
                      <h3 className="mt-2 text-xl font-semibold text-foreground">{phrase.phraseText}</h3>
                      <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-muted-foreground">{phrase.explanation?.easyMeaning}</p>
                    </div>
                    <div className="mt-3 text-sm text-muted-foreground lg:mt-0 lg:text-foreground">{phrase.category}</div>
                    <div className="text-sm text-muted-foreground lg:text-foreground">{phrase.difficultyLevel}</div>
                    <div className="flex items-center gap-2 lg:justify-start">
                      {phrase.isFavorite && <Star className="h-4 w-4 fill-accent text-accent" />}
                      {phrase.isLearned && <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Learned</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
