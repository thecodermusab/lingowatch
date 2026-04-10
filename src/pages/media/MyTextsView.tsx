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
    return <div className="min-h-full flex-1 bg-[#1a1b1d] flex items-center justify-center text-white/50"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="min-h-full flex-1 bg-[#1c1c1c] text-white p-6 relative">
      <div className="mx-auto max-w-[1000px] flex flex-col gap-8">
        
        {/* Banner */}
        <div className="rounded-xl border border-white/5 bg-[#422c54] p-4 text-[15px] flex items-start gap-2 shadow-sm">
          <span>👉</span>
          <div className="flex flex-col text-[#dcdcdc] tracking-wide leading-relaxed">
            <div>
              <span className="font-semibold text-white">Import webpages using the right-click menu.</span>{" "}
              <button type="button" className="underline text-white/70 hover:text-white">(Show more)</button>
            </div>
            <button type="button" className="text-left underline text-[#a78bfa] hover:text-[#c4b5fd]">Browser extension required for this feature.</button>
          </div>
        </div>

        {/* Action Row */}
        <div>
          <button className="flex items-center gap-6 group hover:opacity-90 transition-opacity">
            <div className="w-[84px] h-[84px] rounded-2xl border-2 border-[#1f5c7a] bg-[#121c25] flex items-center justify-center">
               <Plus className="w-8 h-8 text-[#28a8d7]" strokeWidth={2.5} />
            </div>
            <span className="text-xl text-[#eee] tracking-wide font-medium">New Text</span>
          </button>
        </div>

        {/* Text List */}
        <div className="flex flex-col gap-4 pl-3 mt-4">
          <div className="text-[11px] text-[#555] font-mono mb-[-10px]">1</div> {/* Generic row numbering matching screenshot layout */}
          
          {textsQuery.isLoading ? (
            <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-white/30" /></div>
          ) : items.length === 0 ? (
            <div className="text-white/40 text-center py-20 italic">No imported texts. Add one using the extension or use manual entry!</div>
          ) : (
            items.map((item) => {
              let urlDomain = item.sourceName || "lingowatch.com";
              try {
                if (item.sourceUrl && item.sourceUrl.startsWith('http')) {
                  urlDomain = new URL(item.sourceUrl).hostname.replace('www.', '');
                }
              } catch(e) {}
              
              return (
                <div
                  key={item.id}
                  className="group relative flex items-center gap-6 p-2 -mx-2 rounded-xl transition-colors hover:bg-white/5"
                >
                  
                  {/* Icon */}
                  <Link to={`/read/web/${item.id}`} className="shrink-0 relative">
                    <div className="w-[84px] h-[84px] rounded-2xl bg-gradient-to-tr from-[#3f1d5e] to-[#603285] flex items-center justify-center shadow-md overflow-hidden relative">
                      <BookText className="w-10 h-10 text-white/80" strokeWidth={1.5} />
                      {item.favIconUrl && (
                         <div className="absolute bottom-2 left-2 w-6 h-6 rounded-md bg-white p-0.5 shadow">
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
                    <h2 className="text-[17px] font-medium text-[#f5f5f5] tracking-wide truncate mb-1">
                      {item.title}
                    </h2>
                    
                    <div className="flex items-center gap-3 text-[13px] text-[#888]">
                      <span>{item.importedAt ? formatDistanceToNow(new Date(item.importedAt), { addSuffix: true }) : "recently"}</span>
                      {item.sourceUrl ? (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 hover:text-[#bbb] transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {urlDomain} <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="flex items-center gap-1 text-[#666]">
                          {urlDomain} <ExternalLink className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 mt-2">
                       {/* Progress Line */}
                       <div className="w-24 h-[3px] bg-[#333] rounded-full overflow-hidden">
                          <div className="h-full bg-[#46c483]" style={{ width: `${Math.max(2, item.progress?.percent || 0)}%` }} />
                       </div>
                       
                       {/* Metadata stats */}
                       <div className="flex items-center gap-4 text-[13px] text-[#666] font-mono tracking-tighter">
                         <span>#{item.id.substring(item.id.length - 4) || "272"}</span>
                         <span>{item.pageCount || 1} pages</span>
                       </div>
                    </div>
                  </button>

                  {/* Trash */}
                  <button
                    type="button"
                    className="pointer-events-none absolute right-4 p-2 text-[#666] opacity-0 transition-all group-hover:pointer-events-auto group-hover:opacity-100 hover:text-[#aaa]"
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
