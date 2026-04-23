import { useState } from "react";
import { RefreshCw, Sparkles, SlidersHorizontal, X, BookOpen } from "lucide-react";
import { Switch } from "@/components/ui/switch";

type Mode = "vocabulary" | "phrases";

export default function RandomPreviewPage() {
  const [showMeaning, setShowMeaning] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [mode, setMode] = useState<Mode>("vocabulary");
  const [commonOnly, setCommonOnly] = useState(true);

  return (
    <div className="relative flex min-h-screen flex-col bg-background">

      {/* Filters trigger */}
      <button
        onClick={() => setShowFilters(true)}
        className="absolute right-5 top-6 z-10 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
      </button>

      {/* Bottom sheet */}
      {showFilters && (
        <>
          <div className="fixed inset-0 z-20 bg-black/40" onClick={() => setShowFilters(false)} />
          <div className="fixed inset-x-0 bottom-0 z-30 rounded-t-3xl bg-card px-6 pb-10 pt-5 animate-in slide-in-from-bottom-4 duration-300">
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted-foreground/20" />
            <div className="mb-5 flex items-center justify-between">
              <p className="text-base font-semibold text-foreground">Filters</p>
              <button onClick={() => setShowFilters(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-5">
              <div>
                <p className="mb-2.5 text-xs font-medium text-muted-foreground">Mode</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["vocabulary", "phrases"] as Mode[]).map(m => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`rounded-2xl border py-2.5 text-sm font-medium capitalize transition-colors ${mode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2.5 text-xs font-medium text-muted-foreground">Difficulty</p>
                <div className="flex flex-wrap gap-2">
                  {["All Levels", "Beginner", "Intermediate", "Advanced"].map(l => (
                    <button key={l} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${l === "All Levels" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2.5 text-xs font-medium text-muted-foreground">Category</p>
                <div className="flex flex-wrap gap-2">
                  {["All Categories", "Work", "Emotions", "Travel", "Food", "Business"].map(c => (
                    <button key={c} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${c === "All Categories" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{c}</button>
                  ))}
                </div>
              </div>
              {mode === "vocabulary" && (
                <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
                  <span className="text-sm text-foreground">Common words only</span>
                  <Switch checked={commonOnly} onCheckedChange={setCommonOnly} />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-32">
        <div className="flex flex-col items-center px-8 pt-20 text-center">
          <p className="mb-5 text-xs text-muted-foreground/50">{mode === "vocabulary" ? "word" : "phrase"} · Emotions · beginner</p>
          <h1 className="text-6xl font-bold text-foreground">frustrated</h1>

          {!showMeaning && (
            <button
              onClick={() => setShowMeaning(true)}
              className="mt-6 flex items-center gap-1.5 text-sm text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              <BookOpen className="h-3.5 w-3.5" /> Show meaning
            </button>
          )}
        </div>

        {showMeaning && (
          <div className="mx-auto mt-10 max-w-sm space-y-8 px-8 pb-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">Easy meaning</p>
              <p className="text-base leading-relaxed text-foreground/90">When you really want to do something but you can't — it makes you feel annoyed and stuck.</p>
            </div>
            <div className="border-t border-border/50" />
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">AI explanation</p>
              <p className="text-base leading-relaxed text-foreground/90">"Frustrated" describes the feeling of being blocked from reaching a goal. It's stronger than "annoyed" but less than "angry".</p>
            </div>
            <div className="border-t border-border/50" />
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">Examples</p>
              <div className="space-y-3">
                {[
                  { type: "simple", text: "He felt frustrated with the slow internet." },
                  { type: "daily", text: "She sighed, frustrated that nobody was listening." },
                  { type: "work", text: "The team was frustrated by constant deadline changes." },
                ].map(ex => (
                  <p key={ex.type} className="text-base leading-relaxed text-foreground/80">
                    <span className="font-medium text-muted-foreground">{ex.type}:</span> {ex.text}
                  </p>
                ))}
              </div>
            </div>
            <div className="border-t border-border/50" />
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">Somali</p>
              <p className="text-base leading-relaxed text-foreground/90"><span className="font-medium text-muted-foreground">Macnaha:</span> Dareen aad u xanaaqsan markii wax lagu hor joogsado.</p>
              <p className="mt-2 text-base leading-relaxed text-foreground/90"><span className="font-medium text-muted-foreground">Tusaale:</span> Waxaan dareemay frustrated markii internetku xidhmay.</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom actions — floating, no background */}
      <div className="fixed inset-x-0 bottom-0 flex items-center justify-center gap-8 py-6">
        <button className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background">
            <RefreshCw className="h-5 w-5" />
          </div>
          <span className="text-xs">Skip</span>
        </button>
        <button className="flex flex-col items-center gap-1.5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xs text-muted-foreground">Save</span>
        </button>
      </div>
    </div>
  );
}
