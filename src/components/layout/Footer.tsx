import { BookOpen } from "lucide-react";
import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="border-t bg-card">
      <div className="container py-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <BookOpen className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">PhrasePal AI</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Learn English phrases simply. Built for Somali speakers and all ESL learners.
          </p>
        </div>
      </div>
    </footer>
  );
}
