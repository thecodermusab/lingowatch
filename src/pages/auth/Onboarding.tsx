import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { DifficultyLevel } from "@/types";

export default function OnboardingPage() {
  const { user, completeOnboarding } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [preferredLanguage, setPreferredLanguage] = useState(user?.preferredLanguage || "somali");
  const [englishLevel, setEnglishLevel] = useState<DifficultyLevel>(user?.englishLevel || "beginner");
  const [somaliModeEnabled, setSomaliModeEnabled] = useState(Boolean(user?.somaliModeEnabled ?? true));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const handleContinue = async () => {
    setIsSaving(true);
    setError("");
    try {
      await completeOnboarding({
        fullName: fullName.trim() || user?.fullName || "Learner",
        preferredLanguage,
        englishLevel,
        somaliModeEnabled,
      });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save onboarding");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1B202A] px-4 py-8">
      <div className="w-full max-w-xl rounded-[28px] bg-[#f5f5f5] p-8 shadow-[0_12px_50px_rgba(0,0,0,0.35)] sm:p-10">
        <img src="/branding/Logo.png" alt="LingoWatch" className="mb-6 h-14 w-14 object-contain" />
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">First time setup</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Set up your learning space</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We use this to personalize explanations, Somali support, and your review flow.
        </p>

        <div className="mt-8 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="full-name">Name</Label>
            <input
              id="full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              placeholder="Your name"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Preferred language</Label>
              <Select value={preferredLanguage} onValueChange={setPreferredLanguage}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="somali">Somali</SelectItem>
                  <SelectItem value="english">English</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>English level</Label>
              <Select value={englishLevel} onValueChange={(value) => setEnglishLevel(value as DifficultyLevel)}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-border bg-white px-4 py-4">
            <div>
              <p className="text-sm font-medium text-foreground">Somali support</p>
              <p className="text-xs text-muted-foreground">Show Somali meanings and coaching notes while you learn.</p>
            </div>
            <Switch checked={somaliModeEnabled} onCheckedChange={setSomaliModeEnabled} />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button onClick={handleContinue} disabled={isSaving} className="h-11 w-full">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Continue to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
