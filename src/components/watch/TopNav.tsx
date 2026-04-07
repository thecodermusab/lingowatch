import { ArrowLeft, Captions, Grid2X2, ListVideo, Search, Share2, Volume2 } from "lucide-react";
import { Link } from "react-router-dom";

interface TopNavProps {
  title: string;
}

function decodeHtml(input: string): string {
  if (typeof window === "undefined") return input;
  const parser = new DOMParser();
  return parser.parseFromString(input, "text/html").documentElement.textContent || input;
}

const utilityIcons = [Captions, Share2, Grid2X2, ListVideo, Volume2];

export function TopNav({ title }: TopNavProps) {
  return (
    <header className="border-b border-white/[0.06] bg-[#1b1f24]">
      <div className="flex h-12 items-center gap-2 px-3 text-[13px] text-white/76 lg:px-4">
        <Link
          to="/media"
          className="inline-flex h-8 items-center gap-2 rounded-md border border-white/[0.08] bg-[#2a2f35] px-3 text-[12px] font-medium text-white/84 transition hover:bg-[#343a42]"
        >
          <ArrowLeft className="h-4 w-4" />
          CATALOGUE
        </Link>

        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/56 transition hover:bg-white/[0.05] hover:text-white"
          aria-label="Previous"
        >
          <span className="text-[15px] leading-none">|◀</span>
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/56 transition hover:bg-white/[0.05] hover:text-white"
          aria-label="Play"
        >
          <span className="text-[15px] leading-none">▶</span>
        </button>

        <div className="min-w-0 flex-1 px-2">
          <p className="truncate text-[13px] font-medium text-white/84">{decodeHtml(title)}</p>
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          {utilityIcons.map((Icon, index) => (
            <button
              key={index}
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/56 transition hover:bg-white/[0.05] hover:text-white"
              aria-label="Toolbar action"
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/56 transition hover:bg-white/[0.05] hover:text-white"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
