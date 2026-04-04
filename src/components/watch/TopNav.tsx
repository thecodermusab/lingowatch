import { Bell, Captions, Menu, Mic, Plus, Search, SquareMousePointer, X } from "lucide-react";

const utilityIcons = [Captions, SquareMousePointer, Search, Mic];

export function TopNav() {
  return (
    <header className="border-b border-white/8 bg-[#0a0a0c]">
      <div className="mx-auto flex h-12 w-full items-center gap-3 px-4 text-[13px] text-white/78 xl:px-5">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-white/72 transition hover:bg-white/6 hover:text-white"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" strokeWidth={2.2} />
        </button>
        <span className="min-w-7 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/48">TR</span>

        <div className="mx-auto flex h-9 w-full max-w-[600px] items-center rounded-full border border-white/10 bg-[#121316] pl-4 pr-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <input
            type="text"
            value="tec"
            readOnly
            aria-label="Search"
            className="h-full flex-1 bg-transparent text-sm font-medium text-white/84 outline-none placeholder:text-white/28"
          />
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white/54 transition hover:bg-white/6 hover:text-white/84"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="mx-2 h-4 w-px bg-white/8" />
          <div className="flex items-center gap-1">
            {utilityIcons.map((Icon, index) => (
              <button
                key={index}
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white/54 transition hover:bg-white/6 hover:text-white"
                aria-label="Toolbar action"
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="hidden h-8 items-center gap-1.5 rounded-sm px-2 text-sm font-semibold text-white/86 transition hover:bg-white/6 lg:inline-flex"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.3} />
            Create
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/6 hover:text-white"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" strokeWidth={2.1} />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#c43b75] text-xs font-semibold text-white"
            aria-label="Profile"
          >
            S
          </button>
        </div>
      </div>
    </header>
  );
}
