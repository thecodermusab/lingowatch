import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { DifficultyLevel } from "@/types";

export default function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const { toast } = useToast();

  if (!user) return null;

  const handleSave = () => {
    toast({ title: "Settings saved!" });
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

        <Button onClick={handleSave} className="w-full">Save Settings</Button>
      </div>
    </div>
  );
}
