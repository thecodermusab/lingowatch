import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Trash2, ArrowLeft, RotateCcw, CheckCircle2, Volume2, Globe, BookOpen, Lightbulb, MessageCircle, AlertTriangle, Edit, Loader2, Save, X, Sparkles } from "lucide-react";
import { generateAIExplanation } from "@/lib/ai";
import { useToast } from "@/hooks/use-toast";
import { categories } from "@/lib/mockData";
import { DifficultyLevel, PhraseType } from "@/types";
import { getReviewStage } from "@/lib/review";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

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

function SectionCard({ icon: Icon, title, children, color = "bg-primary/10 text-primary" }: { icon: any; title: string; children: React.ReactNode; color?: string }) {
  return (
    <div className="admin-panel admin-panel-body">
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function PhraseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { phrases, toggleFavorite, toggleLearned, deletePhrase, savePhraseEdits, updatePhrase } = usePhraseStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [phraseText, setPhraseText] = useState("");
  const [phraseType, setPhraseType] = useState<PhraseType>("phrase");
  const [category, setCategory] = useState("Daily Life");
  const [difficultyLevel, setDifficultyLevel] = useState<DifficultyLevel>("beginner");
  const [notes, setNotes] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const phrase = phrases.find((p) => p.id === id);

  useEffect(() => {
    if (!phrase) return;
    setPhraseText(phrase.phraseText);
    setPhraseType(phrase.phraseType);
    setCategory(phrase.category);
    setDifficultyLevel(phrase.difficultyLevel);
    setNotes(phrase.notes);
    setNoteDraft(phrase.notes);
  }, [phrase]);

  if (!phrase) {
    return (
      <div className="app-page max-w-4xl py-16 text-center">
        <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold text-foreground">Phrase not found</h2>
        <Link to="/library"><Button className="mt-4">Go to Library</Button></Link>
      </div>
    );
  }

  const ex = phrase.explanation;
  const examples = phrase.examples || [];
  const reviewStage = getReviewStage(phrase.review);

  const handleGenerateExplanation = async () => {
    setIsGenerating(true);
    try {
      const result = await generateAIExplanation(phrase.phraseText);
      updatePhrase(phrase.id, {
        explanation: result,
        examples: result.examples?.map((e: any) => ({
          id: crypto.randomUUID(),
          phraseId: phrase.id,
          exampleType: e.type,
          exampleText: e.text,
        })) ?? [],
      });
      toast({ title: "Explanation generated!" });
    } catch (err) {
      toast({ title: "Failed to generate", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deletePhrase(phrase.id);
      toast({ title: "Phrase deleted" });
      navigate("/library");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleCancelEdit = () => {
    setPhraseText(phrase.phraseText);
    setPhraseType(phrase.phraseType);
    setCategory(phrase.category);
    setDifficultyLevel(phrase.difficultyLevel);
    setNotes(phrase.notes);
    setIsEditing(false);
  };

  const handleCancelNotesEdit = () => {
    setNoteDraft(phrase.notes);
    setIsEditingNotes(false);
  };

  const handleSaveEdit = async () => {
    const trimmedPhraseText = phraseText.trim();

    if (!trimmedPhraseText) {
      toast({ title: "Please enter a phrase", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      await savePhraseEdits(phrase.id, {
        phraseText: trimmedPhraseText,
        phraseType,
        category,
        difficultyLevel,
        notes,
      });
      toast({ title: "Phrase updated" });
      setIsEditing(false);
    } catch (error) {
      toast({
        title: "Failed to update phrase",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSpeak = () => {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(phrase.phraseText);
      u.lang = "en-US";
      u.rate = 0.8;
      speechSynthesis.speak(u);
    }
  };

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    try {
      updatePhrase(phrase.id, { notes: noteDraft });
      setNotes(noteDraft);
      setIsEditingNotes(false);
      toast({ title: "Notes updated" });
    } catch (error) {
      toast({
        title: "Failed to update notes",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSavingNotes(false);
    }
  };

  return (
    <div className="app-page">
      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
        isPending={isDeleting}
        title="Delete this phrase?"
        description="This phrase will be removed from your library."
      />
      <div className="page-stack">
        <div className="admin-panel admin-panel-body">
          <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {isEditing ? (
            <div className="space-y-4 rounded-[1.5rem] border border-border bg-secondary/22 p-5">
              <div>
                <Label htmlFor="phrase-text">Word or Phrase</Label>
                <Input id="phrase-text" value={phraseText} onChange={(e) => setPhraseText(e.target.value)} className="mt-1" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Phrase Type</Label>
                  <Select value={phraseType} onValueChange={(value) => setPhraseType(value as PhraseType)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {phraseTypes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Difficulty</Label>
                <Select value={difficultyLevel} onValueChange={(value) => setDifficultyLevel(value as DifficultyLevel)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {difficultyLevels.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={4} />
              </div>
              <p className="text-sm text-muted-foreground">
                If you change the phrase text or phrase type, the AI explanation will update too.
              </p>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div>
                <span className="admin-chip">
                  {phrase.phraseType.replace("_", " ")}
                </span>
                <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">{phrase.phraseText}</h1>
                {ex?.pronunciationText && (
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">{ex.pronunciationText}</p>
                    <button onClick={handleSpeak} className="rounded-full p-1 text-primary hover:bg-primary/10">
                      <Volume2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            {isEditing ? (
              <>
                <Button size="sm" onClick={handleSaveEdit} className="h-10 gap-1 rounded-xl px-4" disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </Button>
                <Button variant="outline" size="sm" onClick={handleCancelEdit} className="h-10 gap-1 rounded-xl px-4" disabled={isSaving}>
                  <X className="h-4 w-4" /> Cancel
                </Button>
              </>
            ) : (
              <>
                <Button variant={phrase.isFavorite ? "default" : "outline"} size="sm" onClick={() => toggleFavorite(phrase.id)} className="h-10 gap-1 rounded-xl px-4">
                  <Star className={`h-4 w-4 ${phrase.isFavorite ? "fill-current" : ""}`} />
                  {phrase.isFavorite ? "Favorited" : "Favorite"}
                </Button>
                <Button variant={phrase.isLearned ? "default" : "outline"} size="sm" onClick={() => toggleLearned(phrase.id)} className="h-10 gap-1 rounded-xl px-4">
                  <CheckCircle2 className="h-4 w-4" />
                  {phrase.isLearned ? "Learned ✓" : "Mark Learned"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="h-10 gap-1 rounded-xl px-4">
                  <Edit className="h-4 w-4" /> Edit
                </Button>
                <Link to="/review">
                  <Button variant="outline" size="sm" className="h-10 gap-1 rounded-xl px-4">
                    <RotateCcw className="h-4 w-4" /> Review
                  </Button>
                </Link>
                <Button variant="outline" size="sm" onClick={() => setShowDeleteDialog(true)} className="h-10 gap-1 rounded-xl px-4 text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>Stage: {reviewStage}</span>
            <span>Category: {phrase.category}</span>
            <span>Difficulty: {phrase.difficultyLevel}</span>
            <span>Added: {new Date(phrase.createdAt).toLocaleDateString()}</span>
            {phrase.review?.lastReviewedAt && <span>Last reviewed: {new Date(phrase.review.lastReviewedAt).toLocaleDateString()}</span>}
            {phrase.review && <span>Next review: {new Date(phrase.review.nextReviewAt).toLocaleDateString()}</span>}
          </div>
        </div>

        {!ex && (
          <div className="admin-panel admin-panel-body flex flex-col items-center gap-3 py-10 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No explanation yet for this word.</p>
            <Button onClick={handleGenerateExplanation} disabled={isGenerating} className="gap-2">
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isGenerating ? "Generating…" : "Generate Explanation"}
            </Button>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-6">
            {ex?.standardMeaning && (
              <SectionCard icon={BookOpen} title="Standard Meaning">
                <p className="text-foreground">{ex.standardMeaning}</p>
              </SectionCard>
            )}

            {ex?.easyMeaning && (
              <SectionCard icon={Lightbulb} title="Easy Meaning ✨" color="bg-accent/10 text-accent-foreground">
                <p className="text-lg font-medium text-foreground">{ex.easyMeaning}</p>
              </SectionCard>
            )}

            {ex?.usageContext && (
              <SectionCard icon={MessageCircle} title="When People Use This">
                <p className="text-foreground">{ex.usageContext}</p>
              </SectionCard>
            )}

            {ex?.commonMistake && (
              <SectionCard icon={AlertTriangle} title="Common Mistake" color="bg-destructive/10 text-destructive">
                <p className="text-foreground">{ex.commonMistake}</p>
              </SectionCard>
            )}

            {ex?.relatedPhrases && ex.relatedPhrases.length > 0 && (
              <SectionCard icon={BookOpen} title="Related Phrases">
                <div className="flex flex-wrap gap-2">
                  {ex.relatedPhrases.map((rp, i) => (
                    <span key={i} className="rounded-full border bg-secondary px-3 py-1 text-sm text-secondary-foreground">{rp}</span>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>

          <div className="space-y-6">
            {ex?.aiExplanation && (
              <SectionCard icon={MessageCircle} title="AI Explanation">
                <p className="text-foreground leading-relaxed">{ex.aiExplanation}</p>
              </SectionCard>
            )}

            {examples.length > 0 && (
              <SectionCard icon={BookOpen} title="Example Sentences">
                <ul className="space-y-2">
                  {examples.filter(e => e.exampleType !== "somali").map((ex, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground uppercase">{ex.exampleType}</span>
                      <p className="text-sm italic text-foreground">"{ex.exampleText}"</p>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}

            {(ex?.somaliMeaning || ex?.somaliExplanation) && (
              <div className="admin-panel border-somali/20 bg-somali/5 p-5">
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-somali" />
                  <h3 className="font-semibold text-foreground">Somali Support 🇸🇴</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {ex?.somaliMeaning && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-somali">Meaning</p>
                      <p className="mt-1 text-lg font-medium text-foreground">{ex.somaliMeaning}</p>
                    </div>
                  )}
                  {ex?.somaliExplanation && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-somali">Explanation</p>
                      <p className="mt-1 text-foreground">{ex.somaliExplanation}</p>
                    </div>
                  )}
                  {ex?.somaliSentence && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-somali">Example</p>
                      <p className="mt-1 italic text-foreground">"{ex.somaliSentence}"</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <SectionCard icon={Edit} title="Your Notes">
          {isEditingNotes ? (
            <div className="space-y-3">
              <Textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={4}
                placeholder="Add your notes here..."
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleSaveNotes} className="gap-1" disabled={isSavingNotes}>
                  {isSavingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Notes
                </Button>
                <Button variant="outline" size="sm" onClick={handleCancelNotesEdit} className="gap-1" disabled={isSavingNotes}>
                  <X className="h-4 w-4" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-foreground">{phrase.notes || "No notes yet."}</p>
              <Button variant="outline" size="sm" onClick={() => setIsEditingNotes(true)} className="gap-1">
                <Edit className="h-4 w-4" /> {phrase.notes ? "Edit Notes" : "Add Notes"}
              </Button>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
