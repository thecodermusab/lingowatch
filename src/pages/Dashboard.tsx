import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { BookMarked, BookOpen, Star, PlusCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { getPlayableAudioUrl, rememberPlayableAsset, requestTtsAssets } from "@/lib/ttsAssets";
import { primeAudioUrl } from "@/lib/audioPlayback";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

function LearnedIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M9 12l2 2l4 -4" />
      <path d="M12 3c7.2 0 9 1.8 9 9c0 7.2 -1.8 9 -9 9c-7.2 0 -9 -1.8 -9 -9c0 -7.2 1.8 -9 9 -9" />
    </svg>
  );
}

function FavoritesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M18.918 8.174c2.56 4.982 .501 11.656 -5.38 12.626c-7.702 1.687 -12.84 -7.716 -7.054 -13.229c.309 -.305 1.161 -1.095 1.516 -1.349c0 .528 .27 3.475 1 3.167c3 0 4 -4.222 3.587 -7.389c2.7 1.411 4.987 3.376 6.331 6.174" />
    </svg>
  );
}

function DueIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
      <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
      <path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    </svg>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  index,
  className = "",
  valueClassName = "",
  labelClassName = "",
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: number;
  color: string;
  index: number;
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
}) {
  return (
    <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={index} className={`admin-stat-card ${className}`}>
      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className={`mt-4 text-3xl font-semibold text-foreground ${valueClassName}`}>{value}</p>
      <p className={`mt-1 text-sm text-muted-foreground ${labelClassName}`}>{label}</p>
    </motion.div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { phrases, getStats, getDueForReview, updatePhrase } = usePhraseStore();
  const stats = getStats();
  const dueForReview = getDueForReview();
  const recentPhrases = [...phrases].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  useEffect(() => {
    const resolvePhraseAsset = (phrase: typeof recentPhrases[number]) =>
      phrase.audio?.audioUrl || phrase.audio?.playbackUrl || phrase.audioUrl
        ? {
            text: phrase.phraseText,
            audioUrl: phrase.audio?.audioUrl || phrase.audioUrl,
            playbackUrl: phrase.audio?.playbackUrl,
            audioStatus: phrase.audio?.audioStatus || (phrase.audioUrl ? "ready" : undefined),
            voice: phrase.audio?.voice,
            language: phrase.audio?.language,
            ttsHash: phrase.audio?.ttsHash,
          }
        : phrase.audio;

    const phrasesNeedingAudio = recentPhrases.filter((phrase) => !getPlayableAudioUrl(resolvePhraseAsset(phrase)));
    recentPhrases.forEach((phrase) => {
      const asset = resolvePhraseAsset(phrase);
      const playableUrl = getPlayableAudioUrl(asset);
      if (playableUrl) {
        rememberPlayableAsset({ key: phrase.id, text: phrase.phraseText, language: asset?.language, voice: asset?.voice }, asset);
        primeAudioUrl(playableUrl);
      }
    });
    if (!phrasesNeedingAudio.length) return;

    let cancelled = false;
    void requestTtsAssets(
      phrasesNeedingAudio.map((phrase) => ({
        key: phrase.id,
        text: phrase.phraseText,
        language: phrase.audio?.language || "en-US",
        voice: phrase.audio?.voice,
      }))
    ).then((assets) => {
      if (cancelled) return;
      for (const phrase of phrasesNeedingAudio) {
        const asset = assets.get(phrase.id);
        const playableUrl = getPlayableAudioUrl(asset);
        if (!asset || !playableUrl) continue;
        rememberPlayableAsset({ key: phrase.id, text: phrase.phraseText, language: asset.language, voice: asset.voice }, asset);
        updatePhrase(phrase.id, { audio: { ...asset, text: phrase.phraseText } });
        primeAudioUrl(playableUrl);
      }
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [recentPhrases, updatePhrase]);

  return (
    <div className="app-page">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="page-stack">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="admin-kicker">Overview</p>
            <h1 className="admin-page-title">Keep going, {user?.fullName || "Learner"} 👋</h1>
            <p className="admin-page-subtitle">A few words today will make your English feel easier tomorrow.</p>
          </div>
          <Link to="/add-phrase">
            <Button className="h-11 gap-2 rounded-xl px-5">
              <PlusCircle className="h-4 w-4" /> Add Phrase
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard
            icon={BookMarked}
            label="Total Phrases"
            value={stats.totalPhrases}
            color="bg-primary/15 text-primary"
            index={0}
            className="border-primary/30"
            valueClassName="text-primary"
          />
          <StatCard icon={LearnedIcon} label="Learned" value={stats.learnedPhrases} color="bg-success/10 text-success" index={1} />
          <StatCard
            icon={FavoritesIcon}
            label="Favorites"
            value={stats.favoritePhrases}
            color="bg-accent/15 text-accent"
            index={2}
            className="border-accent/30"
            valueClassName="text-accent"
          />
          <StatCard icon={DueIcon} label="Due for Review" value={stats.dueForReview} color="bg-warning/15 text-warning" index={3} />
        </div>

        {dueForReview.length > 0 && (
          <div className="admin-panel border-primary/30 bg-primary/5">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <p className="admin-kicker">Review Queue</p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">{dueForReview.length} phrases to review today</h2>
                <p className="mt-1 text-sm text-muted-foreground">Keep your memory strong with a short review session.</p>
              </div>
              <Link to="/review">
                <Button size="sm" className="h-11 gap-1 rounded-xl px-5">
                  Start Review <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        )}

        <div className="admin-panel overflow-hidden">
          <div className="workspace-section-header">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">Recent Activity</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Recent Phrases</h2>
            </div>
            <Link to="/library" className="text-sm font-medium text-white/80 hover:text-white">View all</Link>
          </div>
          {recentPhrases.length === 0 ? (
            <div className="p-8 text-center">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
              <h3 className="mt-3 font-semibold text-foreground">No phrases yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">Add your first phrase to start learning.</p>
              <Link to="/add-phrase">
                <Button className="mt-4 gap-2">
                  <PlusCircle className="h-4 w-4" /> Add your first phrase
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {recentPhrases.map((phrase) => (
                <Link key={phrase.id} to={`/phrase/${phrase.id}`} className="admin-list-row block">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="admin-chip">{phrase.phraseType.replace("_", " ")}</span>
                      <span className="text-xs text-muted-foreground">{phrase.category}</span>
                      <span className="text-xs text-muted-foreground">{phrase.difficultyLevel}</span>
                    </div>
                    <h3 className="mt-2 text-xl font-semibold text-foreground">{phrase.phraseText}</h3>
                    <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-muted-foreground">{phrase.explanation?.easyMeaning}</p>
                  </div>
                  <div className="flex items-center gap-2 lg:ml-6">
                    {phrase.isLearned && <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Learned</span>}
                    {phrase.isFavorite && <Star className="h-4 w-4 fill-accent text-accent" />}
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
