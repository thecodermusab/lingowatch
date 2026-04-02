import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { DifficultyLevel } from "@/types";
import { getAIHealth, testAIConnection } from "@/lib/ai";
import { Loader2 } from "lucide-react";

export default function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const { toast } = useToast();
  const [aiProvider, setAiProvider] = useState("unknown");
  const [aiModel, setAiModel] = useState("unknown");
  const [aiConfigured, setAiConfigured] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [testLoading, setTestLoading] = useState(false);

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

  return (
    <div className="container max-w-xl py-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Customize your learning experience</p>
        </div>

        <div className="space-y-5 rounded-2xl border bg-card p-6">
          <h2 className="font-semibold text-foreground">Profile</h2>
          <div>
            <Label htmlFor="name">Full Name</Label>
            <Input id="name" value={user.fullName} onChange={(e) => updateProfile({ fullName: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={user.email} disabled className="mt-1" />
          </div>
        </div>

        <div className="space-y-5 rounded-2xl border bg-card p-6">
          <h2 className="font-semibold text-foreground">Learning Preferences</h2>
          <div>
            <Label>English Level</Label>
            <Select value={user.englishLevel} onValueChange={(v) => updateProfile({ englishLevel: v as DifficultyLevel })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="somali">Somali</SelectItem>
                <SelectItem value="turkish">Turkish</SelectItem>
                <SelectItem value="arabic">Arabic</SelectItem>
                <SelectItem value="english">English Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Somali Support</p>
              <p className="text-sm text-muted-foreground">Show Somali meanings and explanations</p>
            </div>
            <Switch checked={user.somaliModeEnabled} onCheckedChange={(v) => updateProfile({ somaliModeEnabled: v })} />
          </div>
        </div>

        <div className="space-y-5 rounded-2xl border bg-card p-6">
          <h2 className="font-semibold text-foreground">AI Connection</h2>
          <div className="space-y-2 text-sm">
            <p className="text-foreground">
              Provider: <span className="font-medium">{statusLoading ? "Loading..." : aiProvider}</span>
            </p>
            <p className="text-foreground">
              Model: <span className="font-medium">{statusLoading ? "Loading..." : aiModel}</span>
            </p>
            <p className={aiConfigured ? "text-success" : "text-muted-foreground"}>
              {statusLoading
                ? "Checking backend..."
                : aiConfigured
                  ? "AI is configured."
                  : "AI is not ready yet. Check your .env.local and backend server."}
            </p>
          </div>

          <Button onClick={handleTestAI} variant="outline" className="w-full" disabled={testLoading || statusLoading}>
            {testLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Test AI Connection
          </Button>
        </div>

        <Button onClick={handleSave} className="w-full">Save Settings</Button>
      </div>
    </div>
  );
}
