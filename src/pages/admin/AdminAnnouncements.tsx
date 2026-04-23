import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const ADMIN_EMAIL = "maahir.engineer@gmail.com";

interface AnnouncementConfig {
  configured: boolean;
  missing: string[];
  defaultCtaUrl: string;
  adminEmail: string;
  requiresAdminKey: boolean;
}

export default function AdminAnnouncementsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [config, setConfig] = useState<AnnouncementConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [headline, setHeadline] = useState("");
  const [intro, setIntro] = useState("");
  const [bulletsText, setBulletsText] = useState("");
  const [ctaLabel, setCtaLabel] = useState("Open LingoWatch");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL;
  const bullets = useMemo(() => bulletsText.split("\n").map((item) => item.trim()).filter(Boolean), [bulletsText]);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const response = await fetch("/api/admin/announcements/config");
        const data = await response.json().catch(() => null);
        if (cancelled || !data) return;
        setConfig(data as AnnouncementConfig);
      } catch {
        if (cancelled) return;
        setConfig({
          configured: false,
          missing: ["Could not load announcement config"],
          defaultCtaUrl: `${window.location.origin}/dashboard`,
          adminEmail: ADMIN_EMAIL,
          requiresAdminKey: false,
        });
      } finally {
        if (!cancelled) {
          setConfigLoading(false);
        }
      }
    }

    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!subject.trim() || !headline.trim() || !intro.trim() || !bullets.length) {
      setError("Subject, headline, intro, and at least one bullet are required.");
      return;
    }

    try {
      setIsSending(true);
      const response = await fetch("/api/admin/announcements/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestedByEmail: user.email,
          subject: subject.trim(),
          headline: headline.trim(),
          intro: intro.trim(),
          bullets,
          ctaLabel: ctaLabel.trim() || "Open LingoWatch",
          ctaUrl: config?.defaultCtaUrl || `${window.location.origin}/dashboard`,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Could not send announcement.");
      }

      toast({
        title: "Announcement sent",
        description: `${data?.sent ?? 0} delivered, ${data?.failed ?? 0} failed.`,
      });
      setSubject("");
      setHeadline("");
      setIntro("");
      setBulletsText("");
      setCtaLabel("Open LingoWatch");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send announcement.";
      setError(message);
      toast({
        title: "Could not send announcement",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <p className="mb-2 text-[11px] font-[700] uppercase tracking-[0.24em] text-primary">Admin only</p>
          <h1 className="text-3xl font-[800] text-foreground">Announcements</h1>
        </div>

        <form onSubmit={handleSubmit} className="rounded-[28px] border border-border bg-card p-6 shadow-sm sm:p-8">
          {!configLoading && config && !config.configured ? (
            <div className="mb-6 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Email is not configured yet: {config.missing.join(", ")}
            </div>
          ) : null}

          <div className="mb-5">
            <label className="block">
              <span className="mb-2 block text-sm font-[700] text-foreground">Subject</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Write the email subject"
                className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none"
              />
            </label>
          </div>

          <div className="mb-5">
            <label className="block">
              <span className="mb-2 block text-sm font-[700] text-foreground">Headline</span>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="Write the main headline"
                className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none"
              />
            </label>
          </div>

          <div className="mb-5">
            <label className="block">
              <span className="mb-2 block text-sm font-[700] text-foreground">Intro</span>
              <textarea
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                rows={4}
                placeholder="Write the intro message"
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none"
              />
            </label>
          </div>

          <div className="mb-5 grid gap-5 sm:grid-cols-[1fr_220px]">
            <label className="block">
              <span className="mb-2 block text-sm font-[700] text-foreground">Bullets</span>
              <textarea
                value={bulletsText}
                onChange={(e) => setBulletsText(e.target.value)}
                rows={7}
                placeholder={"Write one bullet per line"}
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-[700] text-foreground">CTA label</span>
              <input
                type="text"
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                placeholder="Open LingoWatch"
                className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none"
              />
            </label>
          </div>

          {error ? <div className="mb-4 rounded-2xl bg-[#fef3f2] px-4 py-3 text-sm text-[#b42318]">{error}</div> : null}

          <button
            type="submit"
            disabled={isSending || configLoading || !config?.configured}
            className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-7 text-sm font-[800] text-primary-foreground transition-opacity disabled:cursor-default disabled:opacity-70"
          >
            {isSending ? "Sending announcement..." : "Send announcement"}
          </button>
        </form>
      </div>
    </div>
  );
}
