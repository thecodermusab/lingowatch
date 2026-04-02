import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { Button } from "@/components/ui/button";
import { Star, Heart, Trash2, ArrowLeft, RotateCcw, CheckCircle2, Volume2, Globe, BookOpen, Lightbulb, MessageCircle, AlertTriangle, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function SectionCard({ icon: Icon, title, children, color = "bg-primary/10 text-primary" }: { icon: any; title: string; children: React.ReactNode; color?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
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
  const { user } = useAuth();
  const { phrases, toggleFavorite, toggleLearned, deletePhrase } = usePhraseStore(user?.id);
  const navigate = useNavigate();
  const { toast } = useToast();

  const phrase = phrases.find((p) => p.id === id);
  if (!phrase) {
    return (
      <div className="container py-16 text-center">
        <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold text-foreground">Phrase not found</h2>
        <Link to="/library"><Button className="mt-4">Go to Library</Button></Link>
      </div>
    );
  }

  const ex = phrase.explanation;
  const examples = phrase.examples || [];

  const handleDelete = () => {
    deletePhrase(phrase.id);
    toast({ title: "Phrase deleted" });
    navigate("/library");
  };

  const handleSpeak = () => {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(phrase.phraseText);
      u.lang = "en-US";
      u.rate = 0.8;
      speechSynthesis.speak(u);
    }
  };

  return (
    <div className="container max-w-2xl py-8">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-start justify-between">
            <div>
              <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {phrase.phraseType.replace("_", " ")}
              </span>
              <h1 className="mt-2 text-3xl font-bold text-foreground">{phrase.phraseText}</h1>
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
          {/* Actions */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant={phrase.isFavorite ? "default" : "outline"} size="sm" onClick={() => toggleFavorite(phrase.id)} className="gap-1">
              <Star className={`h-4 w-4 ${phrase.isFavorite ? "fill-current" : ""}`} />
              {phrase.isFavorite ? "Favorited" : "Favorite"}
            </Button>
            <Button variant={phrase.isLearned ? "default" : "outline"} size="sm" onClick={() => toggleLearned(phrase.id)} className="gap-1">
              <CheckCircle2 className="h-4 w-4" />
              {phrase.isLearned ? "Learned ✓" : "Mark Learned"}
            </Button>
            <Link to="/review">
              <Button variant="outline" size="sm" className="gap-1">
                <RotateCcw className="h-4 w-4" /> Review
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleDelete} className="gap-1 text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        </div>

        {/* Standard Meaning */}
        {ex?.standardMeaning && (
          <SectionCard icon={BookOpen} title="Standard Meaning">
            <p className="text-foreground">{ex.standardMeaning}</p>
          </SectionCard>
        )}

        {/* Easy Meaning */}
        {ex?.easyMeaning && (
          <SectionCard icon={Lightbulb} title="Easy Meaning ✨" color="bg-accent/10 text-accent-foreground">
            <p className="text-lg font-medium text-foreground">{ex.easyMeaning}</p>
          </SectionCard>
        )}

        {/* AI Explanation */}
        {ex?.aiExplanation && (
          <SectionCard icon={MessageCircle} title="AI Explanation">
            <p className="text-foreground leading-relaxed">{ex.aiExplanation}</p>
          </SectionCard>
        )}

        {/* When to Use */}
        {ex?.usageContext && (
          <SectionCard icon={MessageCircle} title="When People Use This">
            <p className="text-foreground">{ex.usageContext}</p>
          </SectionCard>
        )}

        {/* Examples */}
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

        {/* Somali Section */}
        {(ex?.somaliMeaning || ex?.somaliExplanation) && (
          <div className="rounded-2xl border-2 border-somali/20 bg-somali/5 p-5">
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

        {/* Common Mistake */}
        {ex?.commonMistake && (
          <SectionCard icon={AlertTriangle} title="Common Mistake" color="bg-destructive/10 text-destructive">
            <p className="text-foreground">{ex.commonMistake}</p>
          </SectionCard>
        )}

        {/* Related Phrases */}
        {ex?.relatedPhrases && ex.relatedPhrases.length > 0 && (
          <SectionCard icon={BookOpen} title="Related Phrases">
            <div className="flex flex-wrap gap-2">
              {ex.relatedPhrases.map((rp, i) => (
                <span key={i} className="rounded-full border bg-secondary px-3 py-1 text-sm text-secondary-foreground">{rp}</span>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Notes */}
        {phrase.notes && (
          <SectionCard icon={Edit} title="Your Notes">
            <p className="text-foreground">{phrase.notes}</p>
          </SectionCard>
        )}

        {/* Meta */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Category: {phrase.category}</span>
          <span>Difficulty: {phrase.difficultyLevel}</span>
          <span>Added: {new Date(phrase.createdAt).toLocaleDateString()}</span>
          {phrase.review && <span>Reviewed: {phrase.review.reviewCount} times</span>}
        </div>
      </div>
    </div>
  );
}
