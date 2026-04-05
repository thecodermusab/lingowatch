import { useMemo } from "react";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { BarChart3, Flame, CalendarClock, Brain, Star } from "lucide-react";
import { getReviewStage } from "@/lib/review";

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="admin-stat-card">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-3xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export default function ProgressPage() {
  const { phrases } = usePhraseStore();

  const progress = useMemo(() => {
    const today = startOfToday();
    const tomorrow = addDays(today, 1);
    const weekAgo = addDays(today, -6);

    const reviewedToday = phrases.filter((phrase) => phrase.review?.lastReviewedAt && new Date(phrase.review.lastReviewedAt) >= today).length;
    const learnedThisWeek = phrases.filter((phrase) => phrase.isLearned && new Date(phrase.updatedAt) >= weekAgo).length;
    const dueTomorrow = phrases.filter((phrase) => {
      const next = phrase.review?.nextReviewAt ? new Date(phrase.review.nextReviewAt) : null;
      return next && next >= tomorrow && next < addDays(tomorrow, 1);
    }).length;

    const reviewDays = new Set(
      phrases
        .map((phrase) => phrase.review?.lastReviewedAt)
        .filter(Boolean)
        .map((date) => new Date(date as string).toISOString().slice(0, 10))
    );

    let streak = 0;
    for (let cursor = new Date(today); reviewDays.has(cursor.toISOString().slice(0, 10)); cursor = addDays(cursor, -1)) {
      streak += 1;
    }

    const hardest = [...phrases]
      .filter((phrase) => phrase.review)
      .sort((a, b) => (a.review?.confidenceScore ?? 0) - (b.review?.confidenceScore ?? 0))
      .slice(0, 5);

    const categoryCounts = phrases.reduce<Record<string, number>>((acc, phrase) => {
      acc[phrase.category] = (acc[phrase.category] ?? 0) + 1;
      return acc;
    }, {});

    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    return { reviewedToday, learnedThisWeek, dueTomorrow, streak, hardest, topCategories };
  }, [phrases]);

  return (
    <div className="app-page">
      <div className="page-stack">
        <div>
          <p className="admin-kicker">Progress</p>
          <h1 className="admin-page-title">Learning Progress</h1>
          <p className="admin-page-subtitle">See how your vocabulary and review habit are growing.</p>
        </div>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard icon={BarChart3} label="Reviewed Today" value={progress.reviewedToday} />
          <StatCard icon={Brain} label="Learned This Week" value={progress.learnedThisWeek} />
          <StatCard icon={CalendarClock} label="Due Tomorrow" value={progress.dueTomorrow} />
          <StatCard icon={Flame} label="Current Streak" value={progress.streak} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          <div className="admin-panel overflow-hidden">
            <div className="workspace-section-header">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">Focus</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Hardest words</h2>
              </div>
            </div>
            {progress.hardest.length === 0 ? (
              <div className="p-8 text-sm text-muted-foreground">No review data yet. Start reviewing to see which words need more work.</div>
            ) : (
              <div className="divide-y">
                {progress.hardest.map((phrase) => (
                  <div key={phrase.id} className="admin-list-row">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="admin-chip">{phrase.phraseType.replace("_", " ")}</span>
                        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
                          {getReviewStage(phrase.review)}
                        </span>
                      </div>
                      <p className="mt-2 text-lg font-semibold text-foreground">{phrase.phraseText}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{phrase.explanation?.easyMeaning}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Confidence</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{phrase.review?.confidenceScore ?? 0}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="admin-panel admin-panel-body space-y-5">
            <div>
              <p className="admin-kicker">Trends</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Top categories</h2>
            </div>
            {progress.topCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add more phrases to see category trends.</p>
            ) : (
              <div className="space-y-3">
                {progress.topCategories.map(([category, count]) => (
                  <div key={category} className="rounded-[1.25rem] border border-border bg-secondary/22 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{category}</p>
                        <p className="text-sm text-muted-foreground">{count} saved</p>
                      </div>
                      <Star className="h-4 w-4 text-accent" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
