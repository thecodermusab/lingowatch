import { ReactNode, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, PlusCircle, Library, RotateCcw, Settings, Menu, X, Shuffle, BarChart3, BookText, Sun, Moon } from "lucide-react";
import { SelectionLearningOverlay } from "@/components/learning/SelectionLearningOverlay";
import { useTheme } from "@/contexts/ThemeContext";

const navGroups = [
  [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/random-phrases", label: "Random", icon: Shuffle },
    { to: "/add-phrase", label: "Add Phrase", icon: PlusCircle },
  ],
  [
    { to: "/library", label: "Library", icon: Library },
    { to: "/stories", label: "Stories", icon: BookText },
    { to: "/review", label: "Review", icon: RotateCcw },
    { to: "/progress", label: "Progress", icon: BarChart3 },
  ],
  [
    { to: "/settings", label: "Settings", icon: Settings },
  ],
];

function SidebarLinks({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="space-y-6">
      {navGroups.map((group, groupIndex) => (
        <div key={groupIndex} className={groupIndex > 0 ? "border-t border-white/10 pt-6" : ""}>
          <div className="space-y-1.5">
            {group.map((item) => {
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${active ? "bg-white/10" : "bg-white/5"}`}>
                    <item.icon className="h-4 w-4" />
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur lg:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <Link to="/dashboard" className="flex items-center gap-3">
            <img src="/Logo.png" alt="Lingowatch logo" className="h-10 w-10 object-contain" />
            <div>
              <p className="text-base font-semibold text-foreground">Lingowatch</p>
              <p className="text-xs text-muted-foreground">Watch, save, learn</p>
            </div>
          </Link>

          <button
            type="button"
            className="rounded-xl border border-border bg-card p-2 text-foreground shadow-sm"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 hidden w-80 bg-background lg:block">
        <div className="h-full p-4">
          <div className="flex h-full flex-col rounded-[1.75rem] border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[0_18px_42px_rgba(0,0,0,0.22)]">
            <div className="px-5 py-5">
              <Link to="/dashboard" className="flex items-center gap-4 rounded-2xl">
                <img src="/Logo.png" alt="Lingowatch logo" className="h-11 w-11 object-contain" />
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/35">Workspace</p>
                    <p className="text-lg font-semibold text-white">Lingowatch</p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                    aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                    title={isDark ? "Light mode" : "Dark mode"}
                  >
                    {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </button>
                </div>
              </Link>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5">
              <SidebarLinks />
            </div>

          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute left-0 top-0 h-full w-80 bg-background p-4">
            <div className="flex h-full flex-col rounded-[1.75rem] border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl">
              <div className="mb-2 flex items-center justify-between px-5 py-5">
                <Link to="/dashboard" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
                  <img src="/Logo.png" alt="Lingowatch logo" className="h-10 w-10 object-contain" />
                  <div className="flex items-center gap-3">
                    <span className="text-base font-semibold text-white">Lingowatch</span>
                    <button
                      type="button"
                      onClick={toggleTheme}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                      title={isDark ? "Light mode" : "Dark mode"}
                    >
                      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </button>
                  </div>
                </Link>
                <button type="button" className="rounded-xl border border-white/10 p-2 text-white/80" onClick={() => setMobileOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4">
                <SidebarLinks onNavigate={() => setMobileOpen(false)} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <main ref={mainRef} className="min-h-screen bg-background lg:pl-80">
        {children}
      </main>
      {location.pathname !== "/random-phrases" ? <SelectionLearningOverlay containerRef={mainRef} /> : null}
    </div>
  );
}
