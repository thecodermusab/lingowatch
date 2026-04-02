import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { BookOpen, Heart, RotateCcw, Star, PlusCircle, ArrowRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

function StatCard({ icon: Icon, label, value, color, index }: { icon: any; label: string; value: number; color: string; index: number }) {
  return (
    <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={index} className="rounded-2xl border bg-card p-5">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-2xl font-bold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </motion.div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { phrases, getStats, getDueForReview } = usePhraseStore(user?.id);
  const stats = getStats();
  const dueForReview = getDueForReview();
  const recentPhrases = [...phrases].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  return (
    <div className="container py-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        {/* Welcome */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Welcome back, {user?.fullName || "Learner"} 👋</h1>
            <p className="mt-1 text-muted-foreground">Keep building your vocabulary!</p>
          </div>
          <Link to="/add-phrase">
            <Button className="gap-2">
              <PlusCircle className="h-4 w-4" /> Add Phrase
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={BookOpen} label="Total Phrases" value={stats.totalPhrases} color="bg-primary/10 text-primary" index={0} />
          <StatCard icon={TrendingUp} label="Learned" value={stats.learnedPhrases} color="bg-success/10 text-success" index={1} />
          <StatCard icon={Heart} label="Favorites" value={stats.favoritePhrases} color="bg-destructive/10 text-destructive" index={2} />
          <StatCard icon={RotateCcw} label="Due for Review" value={stats.dueForReview} color="bg-accent/10 text-accent-foreground" index={3} />
        </div>

        {/* Review Due */}
        {dueForReview.length > 0 && (
          <div className="rounded-2xl border bg-accent/10 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-foreground">📝 {dueForReview.length} phrases to review today</h2>
                <p className="text-sm text-muted-foreground">Keep your memory strong</p>
              </div>
              <Link to="/review">
                <Button size="sm" className="gap-1">
                  Start Review <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Recent Phrases */}
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Recent Phrases</h2>
            <Link to="/library" className="text-sm font-medium text-primary hover:underline">View all</Link>
          </div>
          {recentPhrases.length === 0 ? (
            <div className="mt-4 rounded-2xl border bg-card p-8 text-center">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
              <h3 className="mt-3 font-semibold text-foreground">No phrases yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">Add your first phrase to start learning!</p>
              <Link to="/add-phrase">
                <Button className="mt-4 gap-2">
                  <PlusCircle className="h-4 w-4" /> Add your first phrase
                </Button>
              </Link>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {recentPhrases.map((phrase) => (
                <Link key={phrase.id} to={`/phrase/${phrase.id}`} className="block rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        {phrase.phraseType.replace("_", " ")}
                      </span>
                      <h3 className="mt-1 font-semibold text-foreground">{phrase.phraseText}</h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">{phrase.explanation?.easyMeaning}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {phrase.isFavorite && <Star className="h-4 w-4 text-accent" />}
                      {phrase.isLearned && <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Learned</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
