import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getAIHealth, getAllAIProviderStatuses, testAIConnection } from "@/lib/ai";
import { loadImportedPhraseBank, phraseBank } from "@/lib/phraseBank";
import { Download, Loader2, LogOut, Upload } from "lucide-react";
import { Phrase, PhraseType, DifficultyLevel, UserProfile } from "@/types";

type PreferredAiProvider = UserProfile["preferredAiProvider"];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, updateProfile, signOut } = useAuth();
  const { phrases, exportBackup, importBackup } = usePhraseStore();
  const { toast } = useToast();
  const [aiProvider, setAiProvider] = useState("unknown");
  const [aiModel, setAiModel] = useState("unknown");
  const [aiConfigured, setAiConfigured] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [testLoading, setTestLoading] = useState(false);
  const [providerStatuses, setProviderStatuses] = useState<Array<{
    provider: PreferredAiProvider;
    model: string;
    configured: boolean;
    ok: boolean;
    message: string;
  }>>([]);
  const [importedCount, setImportedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(phraseBank.length);
  const [sourceLabel, setSourceLabel] = useState("Imported file not found");
  const [bankLoading, setBankLoading] = useState(true);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] = useState<{
    phrases: Phrase[];
    profile?: typeof user;
    fileName: string;
    duplicateCount: number;
    newCount: number;
  } | null>(null);

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      try {
        const [result, statuses] = await Promise.all([getAIHealth(), getAllAIProviderStatuses()]);
        if (!active) return;
        setAiProvider(result.provider);
        setAiModel(result.model);
        setAiConfigured(result.configured);
        setProviderStatuses(statuses);
      } catch {
        if (!active) return;
        setAiProvider("offline");
        setAiModel("unavailable");
        setAiConfigured(false);
        setProviderStatuses([]);
      } finally {
        if (active) {
          setStatusLoading(false);
        }
      }
    }

    loadStatus();
    return () => {
      active = false;
    };
  }, [user?.preferredAiProvider]);

  useEffect(() => {
    let active = true;

    async function loadBank() {
      try {
        const result = await loadImportedPhraseBank();
        if (!active) return;
        setImportedCount(result.entries.length);
        setTotalCount(phraseBank.length + result.entries.length);
        setSourceLabel(result.sourceLabel);
      } catch {
        if (!active) return;
        setImportedCount(0);
        setTotalCount(phraseBank.length);
        setSourceLabel("Imported file not found");
      } finally {
        if (active) {
          setBankLoading(false);
        }
      }
    }

    loadBank();
    return () => {
      active = false;
    };
  }, []);

  const handleSave = () => {
    toast({ title: "Settings saved!" });
  };

  const handleSignOut = () => {
    signOut();
    toast({ title: "Signed out" });
    navigate("/");
  };

  const handleTestAI = async () => {
    setTestLoading(true);
    try {
      const [result, statuses] = await Promise.all([testAIConnection(), getAllAIProviderStatuses()]);
      setAiProvider(result.provider);
      setAiModel(result.model);
      setAiConfigured(true);
      setProviderStatuses(statuses);
      toast({ title: "AI connection works", description: result.message });
    } catch (error) {
      try {
        const statuses = await getAllAIProviderStatuses();
        setProviderStatuses(statuses);
      } catch {}
      toast({
        title: "AI test failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setTestLoading(false);
    }
  };

  const handleExportBackup = () => {
    if (!user) return;

    const backup = {
      app: "Lingowatch",
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: user,
      phrases: exportBackup(),
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateLabel = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `lang-vocabulary-backup-${dateLabel}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    toast({ title: "Backup exported" });
  };

  const parseCsvImport = (raw: string): Phrase[] => {
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      throw new Error("CSV file is empty.");
    }

    const headers = lines[0].split(",").map((item) => item.trim());
    const getIndex = (name: string) => headers.findIndex((header) => header.toLowerCase() === name.toLowerCase());
    const phraseTextIndex = getIndex("phraseText");
    if (phraseTextIndex === -1) {
      throw new Error("CSV needs a phraseText column.");
    }

    return lines.slice(1).map((line) => {
      const cells = line.split(",").map((item) => item.trim());
      const phraseText = cells[phraseTextIndex] || "";
      const phraseType = (cells[getIndex("phraseType")] as PhraseType) || "word";
      const category = cells[getIndex("category")] || "Imported";
      const difficultyLevel = (cells[getIndex("difficultyLevel")] as DifficultyLevel) || "beginner";
      const notes = cells[getIndex("notes")] || "Imported from CSV";
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      return {
        id,
        phraseText,
        phraseType,
        category,
        notes,
        isFavorite: false,
        isLearned: false,
        tags: [],
        difficultyLevel,
        createdAt: now,
        updatedAt: now,
        examples: [],
        review: {
          id: crypto.randomUUID(),
          phraseId: id,
          reviewCount: 0,
          nextReviewAt: now,
          confidenceScore: 0,
        },
      } as Phrase;
    }).filter((phrase) => phrase.phraseText);
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    try {
      const raw = await file.text();
      let parsedPhrases: Phrase[] = [];
      let parsedProfile: typeof user | undefined;

      if (file.name.toLowerCase().endsWith(".csv")) {
        parsedPhrases = parseCsvImport(raw);
      } else {
        const parsed = JSON.parse(raw) as {
          profile?: typeof user;
          phrases?: Phrase[];
        };

        if (!parsed || !Array.isArray(parsed.phrases)) {
          throw new Error("This file does not contain a valid backup.");
        }

        parsedPhrases = parsed.phrases;
        parsedProfile = parsed.profile;
      }

      const existingKeys = new Set(phrases.map((phrase) => phrase.phraseText.trim().toLowerCase()));
      const duplicateCount = parsedPhrases.filter((phrase) => existingKeys.has(phrase.phraseText.trim().toLowerCase())).length;
      const newCount = parsedPhrases.length - duplicateCount;

      setImportPreview({
        phrases: parsedPhrases,
        profile: parsedProfile,
        fileName: file.name,
        duplicateCount,
        newCount,
      });
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setImportLoading(false);
      event.target.value = "";
    }
  };

  const handleConfirmImport = () => {
    if (!importPreview) return;

    const result = importBackup(importPreview.phrases);

    if (importPreview.profile) {
      updateProfile(importPreview.profile);
    }

    toast({
      title: "Import completed",
      description: `${result.importedCount} added, ${result.replacedCount} updated.`,
    });

    setImportPreview(null);
  };

  const providerLabels: Record<PreferredAiProvider, string> = {
    auto: "Auto",
    glm4: "Z.ai GLM-4.7 Flash",
    deepseek: "DeepSeek V3.2",
    "gemini-lite": "Gemini 2.5 Flash-Lite",
    gemini: "Gemini",
    grok: "Grok",
    openrouter: "OpenRouter",
    cerebras: "Cerebras",
    antigravity: "Antigravity",
  };

  if (!user) return null;

  return (
    <div className="app-page">
      <div className="page-stack max-w-5xl">
        <div>
          <p className="admin-kicker">Preferences</p>
          <h1 className="admin-page-title">Settings</h1>
          <p className="admin-page-subtitle">Customize your learning experience.</p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] xl:items-stretch">
          <div className="admin-panel admin-panel-body space-y-5">
            <div>
              <p className="admin-kicker">Profile</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Your details</h2>
            </div>
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" value={user.fullName} onChange={(e) => updateProfile({ fullName: e.target.value })} className="mt-2 h-12 rounded-xl" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={user.email} disabled className="mt-2 h-12 rounded-xl" />
            </div>
            <Button onClick={handleSignOut} variant="outline" className="h-12 w-full rounded-xl text-destructive hover:text-destructive">
              <LogOut className="h-4 w-4" /> Sign Out
            </Button>
          </div>

          <div className="admin-panel admin-panel-body space-y-5">
            <div>
              <p className="admin-kicker">AI</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">AI connection</h2>
            </div>
            <div>
              <Label>Preferred Provider</Label>
              <Select value={user.preferredAiProvider} onValueChange={(value) => updateProfile({ preferredAiProvider: value as PreferredAiProvider })}>
                <SelectTrigger className="mt-2 h-12 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (cost optimized)</SelectItem>
                  <SelectItem value="glm4">Z.ai GLM-4.7 Flash</SelectItem>
                  <SelectItem value="deepseek">DeepSeek V3.2</SelectItem>
                  <SelectItem value="gemini-lite">Gemini 2.5 Flash-Lite</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="grok">Grok</SelectItem>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                  <SelectItem value="cerebras">Cerebras</SelectItem>
                  <SelectItem value="antigravity">Antigravity</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-2 text-sm text-muted-foreground">Auto uses GLM for daily lookups, DeepSeek for bulk work, and Gemini Flash-Lite when Google quality is needed.</p>
            </div>
            <div className="grid gap-3">
              <div className="rounded-[1.25rem] border bg-muted/20 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Active Provider</p>
                <p className="mt-1 text-base font-semibold text-foreground">{statusLoading ? "Loading..." : aiProvider}</p>
              </div>
              <div className="rounded-[1.25rem] border bg-muted/20 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Model</p>
                <p className="mt-1 text-base font-semibold text-foreground">{statusLoading ? "Loading..." : aiModel}</p>
              </div>
              <div className="rounded-[1.25rem] border bg-muted/20 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Status</p>
                <p className={`mt-1 text-sm ${aiConfigured ? "text-success" : "text-muted-foreground"}`}>
                  {statusLoading
                    ? "Checking backend..."
                    : aiConfigured
                      ? "AI is configured."
                      : "AI is not ready yet. Check your env file and backend server."}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">All Providers</p>
                <p className="mt-1 text-sm text-muted-foreground">See which provider is working, limited, or not configured.</p>
              </div>
              <div className="grid gap-3">
                {providerStatuses.map((status) => (
                  <div key={status.provider} className="rounded-[1.25rem] border bg-muted/20 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{providerLabels[status.provider]}</p>
                        <p className="text-xs text-muted-foreground">{status.model}</p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          status.ok
                            ? "bg-emerald-500/10 text-emerald-600"
                            : status.message.toLowerCase().includes("quota")
                              ? "bg-destructive/10 text-destructive"
                              : status.configured
                                ? "bg-amber-500/10 text-amber-600"
                                : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {status.ok
                          ? "Working"
                          : status.message.toLowerCase().includes("quota")
                            ? "Quota reached"
                            : status.configured
                              ? "Unavailable"
                              : "Not configured"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{status.message}</p>
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={handleTestAI} variant="outline" className="h-12 w-full rounded-xl" disabled={testLoading || statusLoading}>
              {testLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test All Providers
            </Button>
          </div>

          <div className="admin-panel admin-panel-body flex h-full flex-col space-y-5">
            <div>
              <p className="admin-kicker">Learning</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Learning preferences</h2>
            </div>
            <div>
              <Label>English Level</Label>
              <Select value={user.englishLevel} onValueChange={(v) => updateProfile({ englishLevel: v as DifficultyLevel })}>
                <SelectTrigger className="mt-2 h-12 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Preferred Language</Label>
              <Select value={user.preferredLanguage} onValueChange={(v) => updateProfile({ preferredLanguage: v })}>
                <SelectTrigger className="mt-2 h-12 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="somali">Somali</SelectItem>
                  <SelectItem value="turkish">Turkish</SelectItem>
                  <SelectItem value="arabic">Arabic</SelectItem>
                  <SelectItem value="english">English Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-1 items-center justify-between rounded-[1.25rem] border bg-muted/20 px-4 py-3">
              <div>
                <p className="font-medium text-foreground">Somali Support</p>
                <p className="text-sm text-muted-foreground">Show Somali meanings and explanations.</p>
              </div>
              <Switch checked={user.somaliModeEnabled} onCheckedChange={(v) => updateProfile({ somaliModeEnabled: v })} />
            </div>

            <div className="flex items-center justify-between rounded-[1.25rem] border bg-muted/20 px-4 py-3">
              <div>
                <p className="font-medium text-foreground">Auto-play audio</p>
                <p className="text-sm text-muted-foreground">Play pronunciation automatically on review cards.</p>
              </div>
              <Switch checked={user.autoPlayAudioEnabled} onCheckedChange={(v) => updateProfile({ autoPlayAudioEnabled: v })} />
            </div>
          </div>

          <div className="admin-panel admin-panel-body flex h-full flex-col space-y-5">
            <div>
              <p className="admin-kicker">Bank</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Vocabulary bank</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] border bg-muted/20 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Starter Bank</p>
                <p className="mt-1 text-base font-semibold text-foreground">{phraseBank.length}</p>
              </div>
              <div className="rounded-[1.25rem] border bg-muted/20 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Imported Bank</p>
                <p className="mt-1 text-base font-semibold text-foreground">{bankLoading ? "Loading..." : importedCount.toLocaleString()}</p>
              </div>
              <div className="rounded-[1.25rem] border bg-muted/20 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Total in Bank</p>
                <p className="mt-1 text-base font-semibold text-foreground">{bankLoading ? "Loading..." : totalCount.toLocaleString()}</p>
              </div>
              <div className="rounded-[1.25rem] border bg-muted/20 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Saved</p>
                <p className="mt-1 text-base font-semibold text-foreground">{phrases.length.toLocaleString()}</p>
              </div>
            </div>
            <div className="rounded-[1.25rem] border bg-muted/20 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Imported Source</p>
              <p className="mt-1 text-sm text-foreground">{bankLoading ? "Loading..." : sourceLabel}</p>
            </div>
          </div>

          <div className="admin-panel admin-panel-body xl:col-span-2 space-y-5">
            <div>
              <p className="admin-kicker">Backup</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Export and import</h2>
              <p className="mt-1 text-sm text-muted-foreground">Save your phrases and settings to a JSON backup file, then import it later on this device.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[1.25rem] border bg-muted/20 p-4">
                <p className="text-sm font-semibold text-foreground">Export backup</p>
                <p className="mt-1 text-sm text-muted-foreground">Download all saved phrases and your current profile settings.</p>
                <Button onClick={handleExportBackup} variant="outline" className="mt-4 h-11 rounded-xl">
                  <Download className="h-4 w-4" /> Export JSON
                </Button>
              </div>

              <div className="rounded-[1.25rem] border bg-muted/20 p-4">
                <p className="text-sm font-semibold text-foreground">Import backup</p>
                <p className="mt-1 text-sm text-muted-foreground">Import JSON backup or CSV. Existing phrases with the same text will be updated after confirmation.</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json,text/csv,.csv"
                  className="hidden"
                  onChange={handleImportFile}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  className="mt-4 h-11 rounded-xl"
                  disabled={importLoading}
                >
                  {importLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Import File
                </Button>
              </div>
            </div>

            {importPreview ? (
              <div className="rounded-[1.25rem] border bg-muted/20 p-4">
                <p className="text-sm font-semibold text-foreground">Import preview</p>
                <p className="mt-1 text-sm text-muted-foreground">{importPreview.fileName}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border bg-card px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Rows</p>
                    <p className="mt-1 font-semibold text-foreground">{importPreview.phrases.length}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">New</p>
                    <p className="mt-1 font-semibold text-foreground">{importPreview.newCount}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Duplicates</p>
                    <p className="mt-1 font-semibold text-foreground">{importPreview.duplicateCount}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button className="h-11 rounded-xl" onClick={handleConfirmImport}>Confirm Import</Button>
                  <Button variant="outline" className="h-11 rounded-xl" onClick={() => setImportPreview(null)}>Cancel</Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="xl:col-span-2 flex justify-center">
            <Button onClick={handleSave} className="h-12 w-full max-w-md rounded-xl">Save Settings</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
