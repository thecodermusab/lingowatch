import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { categories } from "@/lib/mockData";
import { PhraseType, DifficultyLevel } from "@/types";

const phraseTypes: { value: PhraseType; label: string }[] = [
  { value: "word", label: "Word" },
  { value: "phrase", label: "Phrase" },
  { value: "phrasal_verb", label: "Phrasal Verb" },
  { value: "idiom", label: "Idiom" },
  { value: "expression", label: "Expression" },
];

const difficultyLevels: { value: DifficultyLevel; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export default function AddPhrasePage() {
  const { addPhrase } = usePhraseStore();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [phraseText, setPhraseText] = useState("");
  const [phraseType, setPhraseType] = useState<PhraseType>("phrase");
  const [category, setCategory] = useState("Daily Life");
  const [notes, setNotes] = useState("");
  const [difficultyLevel, setDifficultyLevel] = useState<DifficultyLevel>("beginner");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = phraseText.trim();
    if (!trimmed) {
      toast({ title: "Please enter a phrase", variant: "destructive" });
      return;
    }
    if (trimmed.length < 2) {
      toast({ title: "Phrase is too short", variant: "destructive" });
      return;
    }
    if (trimmed.length > 200) {
      toast({ title: "Phrase is too long (max 200 characters)", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const result = await addPhrase({ phraseText: trimmed, phraseType, category, notes, difficultyLevel });
      if (result) {
        toast({ title: "Phrase saved!", description: `"${trimmed}" has been added with AI explanations.` });
        navigate(`/phrase/${result.id}`);
      }
    } catch (error) {
      toast({
        title: "Failed to save phrase",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-page">
      <div className="page-stack mx-auto max-w-4xl pt-12">
        <div className="text-center">
          <p className="admin-kicker">Create</p>
          <h1 className="admin-page-title">Add a New Phrase</h1>
          <p className="admin-page-subtitle">Enter a word or phrase and let AI explain it for you.</p>
        </div>

        <form onSubmit={handleSubmit} className="admin-panel admin-panel-body space-y-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="space-y-6">
              <div>
                <Label htmlFor="phrase">Word or Phrase *</Label>
                <Input id="phrase" value={phraseText} onChange={(e) => setPhraseText(e.target.value)} placeholder='e.g. "break the ice"' className="mt-2 h-12 rounded-xl" />
              </div>

              <div>
                <Label htmlFor="notes">Personal Notes</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where did you see this phrase? Any notes for yourself..." className="mt-2 min-h-[180px] rounded-2xl" rows={6} />
              </div>
            </div>

            <div className="space-y-5 rounded-[1.5rem] border border-border bg-secondary/22 p-5">
              <div>
                <Label>Phrase Type</Label>
                <Select value={phraseType} onValueChange={(v) => setPhraseType(v as PhraseType)}>
                  <SelectTrigger className="mt-2 h-12 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {phraseTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-2 h-12 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Difficulty</Label>
                <Select value={difficultyLevel} onValueChange={(v) => setDifficultyLevel(v as DifficultyLevel)}>
                  <SelectTrigger className="mt-2 h-12 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {difficultyLevels.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-muted-foreground">
                The app will save the phrase and create the full explanation automatically.
              </p>
            </div>
          </div>

          <Button type="submit" className="h-12 w-full gap-2 rounded-xl sm:w-auto sm:px-6" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Generating AI explanation..." : "Save & Generate AI Explanation"}
          </Button>
        </form>
      </div>
    </div>
  );
}
