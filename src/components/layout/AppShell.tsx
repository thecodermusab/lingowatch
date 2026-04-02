import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, PlusCircle, Library, RotateCcw, Settings, Menu, X, Shuffle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const navGroups = [
  [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/random-phrases", label: "Random", icon: Shuffle },
    { to: "/add-phrase", label: "Add Phrase", icon: PlusCircle },
  ],
  [
    { to: "/library", label: "Library", icon: Library },
    { to: "/review", label: "Review", icon: RotateCcw },
  ],
  [
    { to: "/settings", label: "Settings", icon: Settings },
  ],
];

function SidebarLinks({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();

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
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f4f6f8]">
      <header className="sticky top-0 z-40 border-b border-[#e5e9ef] bg-[#f4f6f8]/90 backdrop-blur lg:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <Link to="/dashboard" className="flex items-center gap-3">
            <img src="/Logo.png" alt="Lang-Vocabulary ai logo" className="h-10 w-10 rounded-xl object-cover shadow-sm" />
            <div>
              <p className="text-base font-semibold text-foreground">Lang-Vocabulary ai</p>
              <p className="text-xs text-muted-foreground">Learn faster</p>
            </div>
          </Link>

          <button
            type="button"
            className="rounded-xl border border-[#e5e9ef] bg-white p-2 text-foreground shadow-sm"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 hidden w-80 bg-[#f4f6f8] lg:block">
        <div className="h-full p-4">
          <div className="flex h-full flex-col rounded-[1.75rem] bg-[#181a1e] text-white shadow-[0_18px_42px_rgba(0,0,0,0.22)]">
            <div className="px-5 py-5">
              <Link to="/dashboard" className="flex items-center gap-4 rounded-2xl">
                <img src="/Logo.png" alt="Lang-Vocabulary ai logo" className="h-11 w-11 rounded-2xl object-cover bg-white" />
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/35">Workspace</p>
                  <p className="text-lg font-semibold text-white">Lang-Vocabulary ai</p>
                </div>
              </Link>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5">
              <SidebarLinks />
            </div>

            <div className="border-t border-white/10 px-6 py-5">
              <p className="text-sm font-medium text-white">{user?.fullName}</p>
              <p className="text-xs text-white/45">{user?.preferredLanguage}</p>
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
          <div className="absolute left-0 top-0 h-full w-80 bg-[#f4f6f8] p-4">
            <div className="flex h-full flex-col rounded-[1.75rem] bg-[#181a1e] text-white shadow-xl">
              <div className="mb-2 flex items-center justify-between px-5 py-5">
                <Link to="/dashboard" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
                  <img src="/Logo.png" alt="Lang-Vocabulary ai logo" className="h-10 w-10 rounded-xl object-cover" />
                  <span className="text-base font-semibold text-white">Lang-Vocabulary ai</span>
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

      <main className="min-h-screen bg-[#f4f6f8] lg:pl-80">{children}</main>
    </div>
  );
}
