import { useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/watch/TopNav";
import { TranscriptPanel } from "@/components/watch/TranscriptPanel";
import { VideoPlayerShell } from "@/components/watch/VideoPlayerShell";
import { TranscriptCue, TranscriptTab } from "@/components/watch/types";
import { savedPhrases, transcriptCues, wordInsights } from "@/lib/watchWorkspaceData";

const TICK_MS = 250;
const TICK_SECONDS = 0.25;

function getActiveCue(cues: TranscriptCue[], currentTime: number) {
  return cues.find((cue) => currentTime >= cue.start && currentTime < cue.end) ?? cues[cues.length - 1] ?? null;
}

export default function WatchWorkspacePage() {
  const [activeTab, setActiveTab] = useState<TranscriptTab>("subtitles");
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [autoPause, setAutoPause] = useState(false);

  const duration = useMemo(() => transcriptCues[transcriptCues.length - 1]?.end ?? 0, []);
  const activeCue = useMemo(() => getActiveCue(transcriptCues, currentTime), [currentTime]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const timer = window.setInterval(() => {
      setCurrentTime((previousTime) => {
        const nextTime = previousTime + TICK_SECONDS;

        if (autoPause) {
          const currentCue = getActiveCue(transcriptCues, previousTime);
          const nextCue = getActiveCue(transcriptCues, nextTime);

          if (currentCue?.id !== nextCue?.id && nextCue) {
            setIsPlaying(false);
            return nextCue.start;
          }
        }

        if (nextTime >= duration) {
          setIsPlaying(false);
          return 0;
        }

        return nextTime;
      });
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [autoPause, duration, isPlaying]);

  function handleSelectCue(cue: TranscriptCue) {
    setCurrentTime(cue.start);
    setIsPlaying(true);
    setActiveTab("subtitles");
  }

  function handleTogglePlay() {
    setIsPlaying((value) => !value);
  }

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-white [font-family:Inter,system-ui,sans-serif]">
      <TopNav />

      <main className="grid min-h-[calc(100vh-48px)] grid-cols-1 bg-[#09090b] xl:grid-cols-[minmax(0,74fr)_minmax(320px,26fr)]">
        <VideoPlayerShell
          cues={transcriptCues}
          activeCue={activeCue}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          autoPause={autoPause}
          onTogglePlay={handleTogglePlay}
          onToggleAutoPause={() => setAutoPause((value) => !value)}
        />

        <TranscriptPanel
          activeTab={activeTab}
          onTabChange={setActiveTab}
          cues={transcriptCues}
          activeCueId={activeCue?.id ?? null}
          onSelectCue={handleSelectCue}
          wordInsights={wordInsights}
          savedPhrases={savedPhrases}
        />
      </main>
    </div>
  );
}
