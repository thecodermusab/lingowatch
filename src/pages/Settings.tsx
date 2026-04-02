import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePhraseStore } from "@/hooks/usePhraseStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { DifficultyLevel } from "@/types";
import { getAIHealth, testAIConnection } from "@/lib/ai";
import { loadImportedPhraseBank, phraseBank } from "@/lib/phraseBank";
import { Download, Loader2, Upload } from "lucide-react";

export default function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const { phrases, exportBackup, importBackup } = usePhraseStore();
  const { toast } = useToast();
  const [aiProvider, setAiProvider] = useState("unknown");
  const [aiModel, setAiModel] = useState("unknown");
  const [aiConfigured, setAiConfigured] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [testLoading, setTestLoading] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(phraseBank.length);
  const [sourceLabel, setSourceLabel] = useState("Imported file not found");
  const [bankLoading, setBankLoading] = useState(true);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!user) return null;

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      try {
        const result = await getAIHealth();
        if (!active) return;
        setAiProvider(result.provider);
        setAiModel(result.model);
        setAiConfigured(result.configured);
      } catch {
        if (!active) return;
        setAiProvider("offline");
        setAiModel("unavailable");
        setAiConfigured(false);
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
  }, []);

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

  const handleTestAI = async () => {
    setTestLoading(true);
    try {
      const result = await testAIConnection();
      setAiProvider(result.provider);
      setAiModel(result.model);
      setAiConfigured(true);
      toast({ title: "AI connection works", description: result.message });
    } catch (error) {
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
      app: "Lang-Vocabulary ai",
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

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as {
        profile?: typeof user;
        phrases?: typeof phrases;
      };

      if (!parsed || !Array.isArray(parsed.phrases)) {
        throw new Error("This file does not contain a valid backup.");
      }

      const result = importBackup(parsed.phrases);

      if (parsed.profile) {
        updateProfile(parsed.profile);
      }

      toast({
        title: "Backup imported",
        description: `${result.importedCount} added, ${result.replacedCount} updated.`,
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
          </div>

          <div className="admin-panel admin-panel-body space-y-5">
            <div>
              <p className="admin-kicker">AI</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">AI connection</h2>
            </div>
            <div className="grid gap-3">
              <div className="rounded-[1.25rem] border bg-muted/20 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Provider</p>
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

            <Button onClick={handleTestAI} variant="outline" className="h-12 w-full rounded-xl" disabled={testLoading || statusLoading}>
              {testLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test AI Connection
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
                <p className="mt-1 text-sm text-muted-foreground">Import a previous JSON backup. Existing phrases with the same text will be updated.</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
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
                  Import JSON
                </Button>
              </div>
            </div>
          </div>

          <div className="xl:col-span-2 flex justify-center">
            <Button onClick={handleSave} className="h-12 w-full max-w-md rounded-xl">Save Settings</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
