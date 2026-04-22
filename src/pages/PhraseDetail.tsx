import { ReactNode, ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Trash2, ArrowLeft, RotateCcw, CheckCircle2, Volume2, Globe, BookOpen, Lightbulb, MessageCircle, AlertTriangle, Edit, Loader2, Save, X, Sparkles } from "lucide-react";
import { generateAIExplanation, getAiProviderLabel, getSavedWordRegenerationProvider, SAVED_WORD_REGENERATION_OPTIONS } from "@/lib/ai";
import { translateText } from "@/lib/googleTranslate";
import { useToast } from "@/hooks/use-toast";
import { categories } from "@/lib/mockData";
import { DifficultyLevel, PhraseType, AIGenerationResult, PreferredAiProvider, PhraseAudioAsset } from "@/types";
import { getReviewStage } from "@/lib/review";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { playPreparedAudio, primeAudioUrl } from "@/lib/audioPlayback";
import { buildPhraseAudioRequests, mergePhraseAudioAssets, requestPhraseAudioAssets, PhraseAudioRequestItem } from "@/lib/phraseAudio";
import { ensureRuntimeTtsAsset, getPlayableAudioUrl, playRuntimeTtsAsset, rememberPlayableAsset } from "@/lib/ttsAssets";

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

function SectionCard({ icon: Icon, title, children, color = "bg-primary/10 text-primary" }: { icon: ComponentType<{ className?: string }>; title: string; children: ReactNode; color?: string }) {
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
  const { phrases, audioPrepByPhraseId, addPhrase, toggleFavorite, toggleLearned, deletePhrase, savePhraseEdits, updatePhrase } = usePhraseStore();
  const navigate = useNavigate();
  const { toast, dismiss } = useToast();
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
  const [googleTranslation, setGoogleTranslation] = useState<string>("");
  const [googleTranslationState, setGoogleTranslationState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [reExplainProvider, setReExplainProvider] = useState<PreferredAiProvider>("deepseek");
  const [relatedPhraseLoading, setRelatedPhraseLoading] = useState("");
  const [audioSyncing, setAudioSyncing] = useState(false);
  const lastAudioSyncRef = useRef<Record<string, number>>({});
  const audioPrepToastRef = useRef<string | null>(null);

  const phrase = phrases.find((p) => p.id === id);

  useEffect(() => {
    if (!phrase) return;
    setPhraseText(phrase.phraseText);
    setPhraseType(phrase.phraseType);
    setCategory(phrase.category);
    setDifficultyLevel(phrase.difficultyLevel);
    setNotes(phrase.notes);
    setNoteDraft(phrase.notes);
    const savedGoogleTranslation = phrase.explanation?.googleTranslation?.trim() || "";
    if (savedGoogleTranslation) {
      setGoogleTranslation(savedGoogleTranslation);
      setGoogleTranslationState("ready");
      return;
    }

    setGoogleTranslation("");
    setGoogleTranslationState("loading");
    translateText(phrase.phraseText)
      .then((translation) => {
        setGoogleTranslation(translation);
        setGoogleTranslationState(translation ? "ready" : "error");
        if (translation && phrase.explanation) {
          updatePhrase(phrase.id, {
            explanation: {
              ...phrase.explanation,
              googleTranslation: translation,
              googleTranslationUpdatedAt: new Date().toISOString(),
            },
          });
        }
      })
      .catch(() => {
        setGoogleTranslation("");
        setGoogleTranslationState("error");
      });
  }, [phrase, updatePhrase]);

  useEffect(() => {
    if (!phrase) return;

    const assets: PhraseAudioAsset[] = [];

    if (phrase.audio?.audioUrl || phrase.audio?.playbackUrl || phrase.audioUrl) {
      assets.push({
        text: phrase.phraseText,
        audioUrl: phrase.audio?.audioUrl || phrase.audioUrl,
        playbackUrl: phrase.audio?.playbackUrl,
        audioStatus: phrase.audio?.audioStatus || (phrase.audioUrl ? "ready" : undefined),
        voice: phrase.audio?.voice,
        language: phrase.audio?.language,
        ttsHash: phrase.audio?.ttsHash,
      });
    }

    for (const example of phrase.examples || []) {
      if (example.audio?.audioUrl || example.audio?.playbackUrl) {
        assets.push({
          text: example.exampleText,
          audioUrl: example.audio.audioUrl,
          playbackUrl: example.audio.playbackUrl,
          audioStatus: example.audio.audioStatus,
          voice: example.audio.voice,
          language: example.audio.language,
          ttsHash: example.audio.ttsHash,
        });
      }
      if (example.translationAudio?.audioUrl || example.translationAudio?.playbackUrl) {
        assets.push({
          text: example.translationText || "",
          audioUrl: example.translationAudio.audioUrl,
          playbackUrl: example.translationAudio.playbackUrl,
          audioStatus: example.translationAudio.audioStatus,
          voice: example.translationAudio.voice,
          language: example.translationAudio.language,
          ttsHash: example.translationAudio.ttsHash,
        });
      }
    }

    if (phrase.explanation?.googleTranslationAudio) {
      assets.push(phrase.explanation.googleTranslationAudio);
    }
    if (phrase.explanation?.somaliMeaningAudio) {
      assets.push(phrase.explanation.somaliMeaningAudio);
    }
    if (phrase.explanation?.somaliSentenceAudio) {
      assets.push(phrase.explanation.somaliSentenceAudio);
    }

    for (const asset of assets) {
      const playableUrl = getPlayableAudioUrl(asset);
      if (!playableUrl) continue;
      rememberPlayableAsset(asset);
      primeAudioUrl(playableUrl);
    }
  }, [phrase, googleTranslation]);

  useEffect(() => {
    if (!phrase || audioSyncing) return;

    const requests = buildPhraseAudioRequests(phrase, googleTranslation);
    if (!requests.length) return;

    const syncFingerprint = `${phrase.id}:${googleTranslation}:${requests.map((request) => request.key).sort().join(",")}`;
    const now = Date.now();
    const lastSyncAt = lastAudioSyncRef.current[syncFingerprint] || 0;
    if (now - lastSyncAt < 15000) return;

    let active = true;
    setAudioSyncing(true);
    lastAudioSyncRef.current[syncFingerprint] = now;

    void requestPhraseAudioAssets(requests)
      .then((assetMap) => {
        if (!active || !assetMap.size) return;
        const nextPhrase = mergePhraseAudioAssets(phrase, assetMap, googleTranslation);
        updatePhrase(phrase.id, nextPhrase);
      })
      .catch(() => {})
      .finally(() => {
        if (active) {
          setAudioSyncing(false);
        }
      });

    return () => {
      active = false;
    };
  }, [phrase, googleTranslation, audioSyncing, updatePhrase]);

  useEffect(() => {
    if (!phrase) return;
    setReExplainProvider(getSavedWordRegenerationProvider(phrase));
  }, [phrase]);

  if (!phrase) {
    // Show nothing while phrases are still loading from the store.
    // Only show "not found" if we have phrases loaded but this ID isn't among them.
    if (phrases.length === 0) return null;
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
  const explainedBy = getAiProviderLabel(ex?.aiProvider, ex?.aiProviderLabel);
  const explainedModel = ex?.aiModel ? ` · ${ex.aiModel}` : "";
  const recommendedReExplainProvider = getSavedWordRegenerationProvider(phrase);
  const audioPrep = audioPrepByPhraseId[phrase.id];
  const audioProgressPercent = audioPrep?.total ? Math.round((audioPrep.ready / audioPrep.total) * 100) : 0;
  const isAudioPreparing = Boolean(audioPrep?.pending);
  const audioPrepLabel = useMemo(() => {
    if (!audioPrep?.total) return null;
    if (isAudioPreparing) return `${audioPrep.ready}/${audioPrep.total}`;
    if (audioPrep.error) return `${audioPrep.ready}/${audioPrep.total}`;
    return "Ready";
  }, [audioPrep, isAudioPreparing]);

  useEffect(() => {
    if (!audioPrep?.total || !isAudioPreparing) {
      if (audioPrepToastRef.current) {
        dismiss(audioPrepToastRef.current);
        audioPrepToastRef.current = null;
      }
      return;
    }

    if (!audioPrepToastRef.current) {
      const toastHandle = toast({
        title: "Preparing audio",
        description: "Main word and example audio are finishing in the background.",
      });
      audioPrepToastRef.current = toastHandle.id;
      window.setTimeout(() => {
        toastHandle.dismiss();
        if (audioPrepToastRef.current === toastHandle.id) {
          audioPrepToastRef.current = null;
        }
      }, 10000);
    }
  }, [audioPrep?.total, isAudioPreparing, toast]);

  const buildExplanation = (result: AIGenerationResult) => ({
    id: phrase.explanation?.id ?? crypto.randomUUID(),
    phraseId: phrase.id,
    standardMeaning: result.standardMeaning,
    easyMeaning: result.easyMeaning,
    aiExplanation: result.aiExplanation,
    usageContext: result.usageContext,
    somaliMeaning: result.somaliMeaning,
    partOfSpeech: result.partOfSpeech,
    somaliExplanation: result.somaliExplanation,
    somaliSentence: result.somaliSentence,
    somaliSentenceTranslation: result.somaliSentenceTranslation,
    usageNote: result.usageNote,
    contextNote: result.contextNote,
    commonMistake: result.commonMistake,
    pronunciationText: result.pronunciationText,
    relatedPhrases: result.relatedPhrases,
    googleTranslation: phrase.explanation?.googleTranslation,
    googleTranslationUpdatedAt: phrase.explanation?.googleTranslationUpdatedAt,
    googleTranslationAudio: phrase.explanation?.googleTranslationAudio,
    somaliMeaningAudio: phrase.explanation?.somaliMeaningAudio,
    somaliSentenceAudio: phrase.explanation?.somaliSentenceAudio,
    aiProvider: result.aiProvider,
    aiProviderLabel: result.aiProviderLabel,
    aiModel: result.aiModel,
  });

  const handleGenerateExplanation = async () => {
    setIsGenerating(true);
    try {
      const translationHint = googleTranslation || phrase.explanation?.googleTranslation || "";
      let result: AIGenerationResult;

      try {
        result = await generateAIExplanation(phrase.phraseText, reExplainProvider, true, translationHint);
      } catch (strictError) {
        result = await generateAIExplanation(phrase.phraseText, "auto", false, translationHint);
        toast({
          title: "Used fallback AI",
          description: strictError instanceof Error
            ? `${getAiProviderLabel(reExplainProvider)} failed, so LingoWatch used the next available AI.`
            : "Selected AI failed, so LingoWatch used the next available AI.",
        });
      }

      const existingExamples = phrase.examples || [];
      updatePhrase(phrase.id, {
        explanation: buildExplanation(result),
        examples: result.examples?.map((example) => ({
          ...(existingExamples.find((item) =>
            item.exampleType === example.type &&
            item.exampleText.trim() === example.text.trim() &&
            (item.translationText || "").trim() === (example.translation || "").trim()
          ) || {}),
          id: existingExamples.find((item) =>
            item.exampleType === example.type &&
            item.exampleText.trim() === example.text.trim() &&
            (item.translationText || "").trim() === (example.translation || "").trim()
          )?.id ?? crypto.randomUUID(),
          phraseId: phrase.id,
          exampleType: example.type,
          exampleText: example.text,
          translationText: example.translation,
          audio: existingExamples.find((item) =>
            item.exampleType === example.type &&
            item.exampleText.trim() === example.text.trim() &&
            (item.translationText || "").trim() === (example.translation || "").trim()
          )?.audio,
          translationAudio: existingExamples.find((item) =>
            item.exampleType === example.type &&
            item.exampleText.trim() === example.text.trim() &&
            (item.translationText || "").trim() === (example.translation || "").trim()
          )?.translationAudio,
        })) ?? [],
      });
      toast({ title: "Explanation generated", description: `Used ${getAiProviderLabel(result.aiProvider, result.aiProviderLabel)}.` });
    } catch (err) {
      toast({ title: "Failed to generate", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRelatedPhraseClick = async (relatedPhrase: string) => {
    const text = relatedPhrase.trim();
    if (!text || relatedPhraseLoading) return;

    const existing = phrases.find((item) => item.phraseText.trim().toLowerCase() === text.toLowerCase());
    if (existing) {
      navigate(`/phrase/${existing.id}`);
      return;
    }

    setRelatedPhraseLoading(text);
    try {
      const tempPhrase = {
        phraseText: text,
        phraseType: text.includes(" ") ? "phrase" as const : "word" as const,
        difficultyLevel: "intermediate" as const,
      };
      const provider = getSavedWordRegenerationProvider(tempPhrase);
      const result = await generateAIExplanation(text, provider, true, googleTranslation || phrase.explanation?.googleTranslation || "");
      const saved = await addPhrase({
        phraseText: text,
        phraseType: result.phraseType || tempPhrase.phraseType,
        category: "Related",
        notes: "",
        difficultyLevel: tempPhrase.difficultyLevel,
      }, result);
      if (saved) {
        navigate(`/phrase/${saved.id}`);
      }
    } catch (error) {
      toast({
        title: "Could not open related phrase",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRelatedPhraseLoading("");
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

  const handleSpeak = (text?: string) => {
    if (!text) {
      const asset: PhraseAudioAsset | undefined = phrase.audio?.audioUrl || phrase.audioUrl
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
      const requestItem: PhraseAudioRequestItem = {
        key: "main",
        text: phrase.phraseText,
        language: phrase.audio?.language || "en-US",
        voice: phrase.audio?.voice,
      };
      void ensurePhraseAudioAndPlay(requestItem, asset, "This phrase does not have a cached audio file yet.");
      return;
    }

    const example = phrase.examples?.find((item) => item.exampleText === text);
    if (!example) {
      toast({
        title: "Could not play audio",
        description: "This example audio could not be found.",
        variant: "destructive",
      });
      return;
    }

    void ensurePhraseAudioAndPlay(
      {
        key: `example:${example.id}`,
        text: example.exampleText,
        language: example.audio?.language || "en-US",
        voice: example.audio?.voice,
      },
      example.audio,
      "This example does not have a cached audio file yet."
    );
  };

  const handlePlayAsset = (
    asset?: PhraseAudioAsset,
    loadingMessage = "This audio is still preparing.",
    requestItem?: PhraseAudioRequestItem
  ) => {
    const playableUrl = getPlayableAudioUrl(asset);
    if (!playableUrl) {
      if (asset?.audioStatus === "error") {
        toast({
          title: "Audio is unavailable",
          description: "This audio file could not be prepared. Tap again to retry.",
          variant: "destructive",
        });
        return;
      }
      if (requestItem) {
        void ensurePhraseAudioAndPlay(requestItem, asset, loadingMessage);
        return;
      }
      toast({
        title: "Audio is still preparing",
        description: loadingMessage,
        variant: "destructive",
      });
      return;
    }

    void playPreparedAudio(playableUrl).catch(() => {
      toast({
        title: "Could not play audio",
        description: "This audio file could not be played right now.",
        variant: "destructive",
      });
    });
  };

  const warmAsset = (asset?: PhraseAudioAsset) => {
    const playableUrl = getPlayableAudioUrl(asset);
    if (playableUrl) {
      rememberPlayableAsset(asset);
      primeAudioUrl(playableUrl);
    }
  };

  const ensurePhraseAudioAndPlay = async (
    requestItem: PhraseAudioRequestItem,
    existingAsset?: PhraseAudioAsset,
    loadingMessage = "This audio is still preparing."
  ) => {
    const existingUrl = getPlayableAudioUrl(existingAsset);
    if (existingUrl) {
      rememberPlayableAsset(requestItem, existingAsset);
    }

    try {
      const runtimeAsset = await playRuntimeTtsAsset(requestItem, existingAsset);
      if (runtimeAsset) {
        if (runtimeAsset.audioStatus === "error" && !getPlayableAudioUrl(runtimeAsset)) {
          throw new Error("audio-unavailable");
        }
        const persistedAsset = await ensureRuntimeTtsAsset(requestItem, existingAsset);
        const nextAsset = persistedAsset || runtimeAsset;
        const assetMap = new Map([[requestItem.key, { ...nextAsset, key: requestItem.key }]]);
        const nextPhrase = mergePhraseAudioAssets(phrase, assetMap, googleTranslation);
        updatePhrase(phrase.id, nextPhrase);
        return;
      }

      toast({
        title: "Audio is still preparing",
        description: loadingMessage,
        variant: "destructive",
      });
    } catch {
      toast({
        title: "Could not prepare audio",
        description: "The audio file could not be generated right now. Tap again to retry.",
        variant: "destructive",
      });
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
                <div className="mt-3 flex items-center gap-2">
                  <h1 className="text-4xl font-semibold tracking-tight text-foreground">{phrase.phraseText}</h1>
                  <button
                    onClick={() => handleSpeak()}
                    onMouseEnter={() => warmAsset(phrase.audio?.audioUrl ? phrase.audio : { text: phrase.phraseText, audioUrl: phrase.audioUrl })}
                    onFocus={() => warmAsset(phrase.audio?.audioUrl ? phrase.audio : { text: phrase.phraseText, audioUrl: phrase.audioUrl })}
                    onTouchStart={() => warmAsset(phrase.audio?.audioUrl ? phrase.audio : { text: phrase.phraseText, audioUrl: phrase.audioUrl })}
                    className="rounded-full p-1 text-primary hover:bg-primary/10"
                    aria-label="Listen to phrase"
                  >
                    <Volume2 className="h-5 w-5" />
                  </button>
                  {audioPrepLabel ? (
                    <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/45 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      {isAudioPreparing ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : null}
                      <span>{audioPrepLabel}</span>
                      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-background/90">
                        <span
                          className={`block h-full rounded-full transition-all ${audioPrep?.error ? "bg-amber-500" : "bg-primary"}`}
                          style={{ width: `${Math.max(audioProgressPercent, audioPrep?.ready ? 10 : 0)}%` }}
                        />
                      </span>
                    </div>
                  ) : null}
                </div>
                {ex?.pronunciationText && (
                  <p className="mt-1 text-sm text-muted-foreground">{ex.pronunciationText}</p>
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
                <Select value={reExplainProvider} onValueChange={(value) => setReExplainProvider(value as PreferredAiProvider)}>
                  <SelectTrigger className="h-10 w-[190px] rounded-xl">
                    <SelectValue placeholder="Choose AI" />
                  </SelectTrigger>
                  <SelectContent>
                    {SAVED_WORD_REGENERATION_OPTIONS.map((provider) => (
                      <SelectItem key={provider.value} value={provider.value}>
                        {provider.label}{provider.value === recommendedReExplainProvider ? " (recommended)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={handleGenerateExplanation} disabled={isGenerating} className="h-10 gap-1 rounded-xl px-4">
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {isGenerating ? "Re-explaining…" : "Re-explain"}
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
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleRelatedPhraseClick(rp)}
                      disabled={Boolean(relatedPhraseLoading)}
                      className="rounded-full border bg-secondary px-3 py-1 text-sm text-secondary-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-60"
                    >
                      {relatedPhraseLoading === rp ? "Opening..." : rp}
                    </button>
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
                      <p className="flex-1 text-sm italic text-foreground">"{ex.exampleText}"</p>
                      <button
                        onClick={() => handleSpeak(ex.exampleText)}
                        onMouseEnter={() => warmAsset(ex.audio)}
                        onFocus={() => warmAsset(ex.audio)}
                        onTouchStart={() => warmAsset(ex.audio)}
                        className="mt-0.5 shrink-0 rounded-full p-1 text-muted-foreground hover:text-primary hover:bg-primary/10"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}

            {(ex?.somaliMeaning || ex?.somaliExplanation || googleTranslation || googleTranslationState === "loading" || googleTranslationState === "error") && (
              <div className="admin-panel border-somali/20 bg-somali/5 p-5">
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-somali" />
                  <h3 className="font-semibold text-foreground">Somali Support 🇸🇴</h3>
                </div>
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-somali">Google Translate</p>
                    <p className="mt-1 text-lg font-medium text-foreground">
                      {googleTranslationState === "loading"
                        ? (ex?.somaliMeaning || "Loading Google translation...")
                        : googleTranslationState === "error"
                          ? (ex?.somaliMeaning || "Google Translate could not load right now.")
                          : googleTranslation}
                    </p>
                    {googleTranslationState === "loading" && ex?.somaliMeaning && (
                      <p className="mt-1 text-xs text-muted-foreground">Google translation is updating in the background.</p>
                    )}
                  </div>
                  {ex?.somaliMeaning && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-somali">AI Meaning</p>
                      <p className="mt-1 text-lg font-medium text-foreground">{ex.somaliMeaning}</p>
                    </div>
                  )}
                  {ex?.somaliExplanation && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-somali">AI Explanation</p>
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

        <div className="admin-panel admin-panel-body">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Edit className="h-4 w-4" />
            </div>
            <h3 className="font-semibold text-foreground">Your Notes</h3>
          </div>
          <div className="mt-3">
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
          </div>
          {(ex?.aiProvider || ex?.aiProviderLabel || ex?.aiModel) && (
            <div className="mt-4 flex justify-end border-t border-border pt-3">
              <p className="text-right text-xs font-medium text-muted-foreground">
                Answered by {explainedBy}{explainedModel}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
