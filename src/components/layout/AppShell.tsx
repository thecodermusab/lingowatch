import { ReactNode, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  PlusCircle,
  Library,
  RotateCcw,
  Settings,
  Menu,
  X,
  Shuffle,
  BarChart3,
  BookText,
  Film,
  Sun,
  Moon,
} from "lucide-react";
import { SelectionLearningOverlay } from "@/components/learning/SelectionLearningOverlay";
import { BrandLogo } from "@/components/BrandLogo";
import { useTheme } from "@/contexts/ThemeContext";

const navGroups = [
  {
    label: "Learning",
    links: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/random-phrases", label: "Random", icon: Shuffle },
      { to: "/add-phrase", label: "Add Phrase", icon: PlusCircle },
    ],
  },
  {
    label: "Workspace",
    links: [
      { to: "/library", label: "Library", icon: Library },
      { to: "/stories", label: "Stories", icon: BookText },
      { to: "/media", label: "Media", icon: Film },
      { to: "/review", label: "Review", icon: RotateCcw },
      { to: "/progress", label: "Progress", icon: BarChart3 },
    ],
  },
  {
    label: "System",
    links: [{ to: "/settings", label: "Settings", icon: Settings }],
  },
];

function isActiveRoute(pathname: string, target: string) {
  if (target === "/dashboard") {
    return pathname === target;
  }
  return pathname === target || pathname.startsWith(`${target}/`);
}

function SidebarLinks({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();

  return (
    <div className="space-y-6">
      {navGroups.map((group, groupIndex) => (
        <div key={group.label} className={groupIndex > 0 ? "border-t border-sidebar-border/75 pt-6" : ""}>
          <p className="px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/44">
            {group.label}
          </p>
          <div className="mt-2 space-y-1.5">
            {group.links.map((item) => {
              const active = isActiveRoute(location.pathname, item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={`group flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-all ${active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_14px_34px_rgba(0,0,0,0.26)]"
                      : "text-sidebar-foreground/72 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                    }`}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${active
                        ? "bg-primary/20 text-primary"
                        : "bg-white/[0.06] text-sidebar-foreground/74 group-hover:bg-white/[0.11] group-hover:text-sidebar-foreground"
                      }`}
                  >
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-xl lg:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <BrandLogo width={80} height={80} className="h-11 w-11 object-contain" />
            <div>
              <p className="text-base font-semibold text-foreground">Lingowatch</p>
            </div>
          </Link>

          <button
            type="button"
            className="rounded-xl border border-border bg-card/90 p-2 text-foreground shadow-sm"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 hidden w-[18.5rem] bg-background lg:block">
        <div className="h-full py-3 pl-3 pr-2">
          <div className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-sidebar-border/90 bg-sidebar/95 text-sidebar-foreground shadow-[0_30px_64px_rgba(0,0,0,0.34)] backdrop-blur-xl">
            <div className="border-b border-sidebar-border/80 px-5 py-5">
              <Link to="/" className="flex items-center gap-2.5 rounded-2xl">
                <BrandLogo width={72} height={72} className="h-14 w-14 shrink-0 object-contain" />
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xl text-white" style={{ fontFamily: "Qurova, sans-serif", fontWeight: 600 }}>
                      Lingowatch
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleTheme(); }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
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
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute left-0 top-0 h-full w-[18rem] max-w-[90vw]">
            <div className="flex h-full flex-col rounded-r-[1.75rem] border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[0_24px_56px_rgba(0,0,0,0.36)]">
              <div className="flex items-center gap-2 px-5 py-5">
                <Link to="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
                  <BrandLogo width={56} height={56} className="h-12 w-12 object-contain" />
                  <span className="text-lg text-white" style={{ fontFamily: "Qurova, sans-serif", fontWeight: 600 }}>
                    Lingowatch
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                >
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4">
                <SidebarLinks onNavigate={() => setMobileOpen(false)} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <main ref={mainRef} className="min-h-screen bg-transparent lg:pl-[18.5rem]">
        {children}
      </main>
      {location.pathname !== "/random-phrases" ? <SelectionLearningOverlay containerRef={mainRef} /> : null}
    </div>
  );
}
