import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface TopNavProps {
  title: string;
}

function decodeHtml(input: string): string {
  if (typeof window === "undefined") return input;
  const parser = new DOMParser();
  return parser.parseFromString(input, "text/html").documentElement.textContent || input;
}

export function TopNav({ title }: TopNavProps) {
  return (
    <header className="border-b border-border bg-card/95">
      <div className="flex h-12 items-center gap-2 px-3 text-[13px] text-muted-foreground lg:px-4">
        <Link
          to="/media"
          className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-secondary/70 px-3 text-[12px] font-medium text-foreground transition hover:bg-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
          Library
        </Link>

        <div className="min-w-0 flex-1 px-2">
          <p className="truncate text-[13px] font-medium text-foreground">{decodeHtml(title)}</p>
        </div>
      </div>
    </header>
  );
}
