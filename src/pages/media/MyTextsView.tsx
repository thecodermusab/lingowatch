import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Plus, Trash2, Loader2, BookText } from "lucide-react";
import { fetchImportedTexts } from "@/lib/importedTexts";
import { useAuth } from "@/contexts/AuthContext";
import { ImportedTextListResponse } from "@/types";

export function MyTextsView() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  
  const textsQuery = useQuery<ImportedTextListResponse>({
    queryKey: ["imported-texts", user?.id],
    queryFn: () => fetchImportedTexts(user?.id || "", { search: "", source: "all", sort: "newest", status: "all" }),
    enabled: Boolean(user?.id),
    refetchOnWindowFocus: true,
  });

  const items = textsQuery.data?.items ?? [];

  if (isAuthLoading) {
    return <div className="min-h-full flex-1 bg-background flex items-center justify-center text-muted-foreground"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto p-6 text-foreground scrollbar-thin scrollbar-thumb-primary/50 scrollbar-track-transparent">
      <div className="mx-auto max-w-[1000px] flex flex-col gap-8">
        
        {/* Banner */}
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card/90 p-4 text-[15px] shadow-sm">
          <span className="text-xl">👉</span>
          <div className="flex flex-col text-muted-foreground tracking-wide leading-relaxed">
            <div>
              <span className="font-semibold text-foreground">Import webpages using the right-click menu.</span>{" "}
              <button type="button" className="underline hover:text-foreground">(Show more)</button>
            </div>
            <button type="button" className="text-left underline text-primary hover:text-primary/80">Browser extension required for this feature.</button>
          </div>
        </div>

        {/* Action Row */}
        <div>
          <button className="group flex items-center gap-6 transition-opacity hover:opacity-95">
            <div className="flex h-[84px] w-[84px] items-center justify-center rounded-2xl border border-primary/40 bg-primary/12">
               <Plus className="w-8 h-8 text-primary" strokeWidth={2.5} />
            </div>
            <span className="text-xl text-foreground tracking-wide font-medium">New Text</span>
          </button>
        </div>

        {/* Text List */}
        <div className="flex flex-col gap-4 pl-3 mt-4">
          <div className="text-[11px] text-muted-foreground font-mono mb-[-10px]">1</div> {/* Generic row numbering matching screenshot layout */}
          
          {textsQuery.isLoading ? (
            <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/30" /></div>
          ) : items.length === 0 ? (
            <div className="text-muted-foreground/60 text-center py-20 italic">No imported texts. Add one using the extension or use manual entry!</div>
          ) : (
            items.map((item) => {
              let urlDomain = item.sourceName || "lingowatch.com";
              try {
                if (item.sourceUrl && item.sourceUrl.startsWith("http")) {
                  urlDomain = new URL(item.sourceUrl).hostname.replace("www.", "");
                }
              } catch {
                urlDomain = item.sourceName || "lingowatch.com";
              }
              
              return (
                <div
                  key={item.id}
                  className="group relative -mx-2 flex items-center gap-6 rounded-xl p-2 transition-colors hover:bg-secondary/30"
                >
                  
                  {/* Icon */}
                  <Link to={`/read/web/${item.id}`} className="shrink-0 relative">
                    <div className="relative flex h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-secondary shadow-md">
                      <BookText className="w-10 h-10 text-primary" strokeWidth={1.5} />
                      {item.favIconUrl && (
                         <div className="absolute bottom-2 left-2 h-6 w-6 rounded-md border border-border bg-background p-0.5 shadow">
                           <img src={item.favIconUrl} className="w-full h-full object-contain" alt="" />
                         </div>
                      )}
                    </div>
                  </Link>

                  {/* Content */}
                  <button
                    type="button"
                    onClick={() => navigate(`/read/web/${item.id}`)}
                    className="flex flex-1 min-w-0 flex-col pr-8 py-2 text-left"
                  >
                    <h2 className="mb-1 truncate text-[17px] font-medium tracking-wide text-foreground">
                      {item.title}
                    </h2>
                    
                    <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
                      <span>{item.importedAt ? formatDistanceToNow(new Date(item.importedAt), { addSuffix: true }) : "recently"}</span>
                      {item.sourceUrl ? (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {urlDomain} <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          {urlDomain} <ExternalLink className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 mt-2">
                       {/* Progress Line */}
                        <div className="w-24 h-[3px] bg-secondary rounded-full overflow-hidden">
                           <div className="h-full bg-primary opacity-85" style={{ width: `${Math.max(2, item.progress?.percent || 0)}%` }} />
                        </div>
                        
                        {/* Metadata stats */}
                        <div className="flex items-center gap-4 text-[13px] font-mono tracking-tighter text-muted-foreground">
                          <span>#{item.id.substring(item.id.length - 4) || "272"}</span>
                          <span>{item.pageCount || 1} pages</span>
                        </div>
                    </div>
                  </button>

                  {/* Trash */}
                  <button
                    type="button"
                    className="pointer-events-none absolute right-4 p-2 text-muted-foreground opacity-0 transition-all group-hover:pointer-events-auto group-hover:opacity-100 hover:text-destructive"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>

                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}
