import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Info, Keyboard, Share, Layout, Play, Search, SpellCheck } from "lucide-react";
import { MOCK_READER_DICTIONARY } from "./mockReaderData";

export default function BookReaderPage() {
  const { id } = useParams();
  const bookData = MOCK_READER_DICTIONARY[id || "default"] || MOCK_READER_DICTIONARY["default"];
  const readerRows = bookData.rows;
  
  const [activeRowId, setActiveRowId] = useState<string>(readerRows[0]?.id || "r1");

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1a1a1a] text-white font-sans overflow-hidden">
      {/* Header */}
      <header className="h-[52px] shrink-0 border-b border-[#3e3e3e] flex items-center justify-between px-3 bg-[#222222]">
        
        {/* Left Section */}
        <div className="flex items-center gap-4 flex-1">
          <Link to="/media" className="flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-[11px] font-medium hover:bg-white/10 transition-colors tracking-wide">
            <ChevronLeft className="h-3.5 w-3.5" />
            CATALOGUE
          </Link>
          
          <div className="flex items-center gap-1 text-white/50">
            <button className="p-1 hover:text-white transition-colors">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M4 4h2v16H4V4zm14 0L8 12l10 8V4z"/></svg>
            </button>
            <button className="p-1 hover:text-white transition-colors">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M6 12l10-8v16L6 12zm12-8h2v16h-2V4z"/></svg>
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-[14px]">
            <span className="text-white/90 truncate max-w-[250px]">{bookData.title}</span>
            <Info className="h-3.5 w-3.5 text-white/40" />
          </div>
        </div>



        {/* Right Section */}
        <div className="flex items-center gap-4 flex-1 justify-end">
          <div className="flex items-center gap-2.5 text-white/50 border-r border-[#3e3e3e] pr-4">
            <button className="hover:text-white transition-colors"><Keyboard className="w-4 h-4" /></button>
            <button className="hover:text-white transition-colors"><Share className="w-4 h-4" /></button>
            <button className="hover:text-white transition-colors"><Layout className="w-4 h-4" /></button>
            <button className="hover:text-white transition-colors rounded-full border border-white/30 px-1.5 text-[9px] font-bold h-5 flex items-center justify-center">AP</button>
            <button className="hover:text-white transition-colors rounded-full border border-white/30 px-1.5 text-[9px] font-bold h-5 flex items-center justify-center">1x</button>
            <button className="hover:text-white transition-colors"><SpellCheck className="w-4 h-4" /></button>
          </div>

          <div className="flex items-center text-[11px] font-bold tracking-widest gap-4 mr-2">
            <button className="text-white border-b-2 border-white pb-[14px] translate-y-[8px]">TEXT</button>
            <button className="text-white/50 pb-[14px] translate-y-[8px]">WORDS</button>
          </div>
          
          <button className="text-white/50 hover:text-white transition-colors ml-2">
            <Search className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content constraints */}
      <main className="flex-1 min-h-0 overflow-y-auto w-full py-10 px-4 scrollbar-thin scrollbar-thumb-[#a855f7] scrollbar-track-transparent">
        <div className="mx-auto w-full max-w-[1000px] rounded-lg overflow-hidden border border-[#2a2a2a] bg-[#1e1e1e]">
          {readerRows.map((row) => (
             <div 
               key={row.id} 
               onClick={() => setActiveRowId(row.id)}
               className={`flex w-full group cursor-pointer transition-colors border-b border-[#2a2a2a] last:border-b-0 ${activeRowId === row.id ? 'bg-[#282828]' : 'hover:bg-[#242424] bg-[#1a1a1a]'}`}
             >
               {/* Left (Source) */}
               <div className="w-1/2 p-5 border-r border-[#2a2a2a] relative">
                 {/* Play indicator injection for active row */}
                 {activeRowId === row.id && (
                    <div className="absolute left-[-20px] top-1/2 -translate-y-1/2 text-[#a855f7]">
                      {/* Using absolute icon overflowing is tricky in a container, let's place it inside with negative margin or padding adjustments */}
                    </div>
                 )}
                 <div className="flex items-start gap-4">
                    <div className="w-5 shrink-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {activeRowId === row.id ? (
                        <div className="rounded-full bg-[#a855f7] p-1 shadow pt-1 inline-flex items-center justify-center opacity-100">
                          <Play fill="currentColor" className="w-3 h-3 text-white ml-[1px]" />
                        </div>
                      ) : (
                        <div className="rounded-full border border-white/20 p-1">
                          <Play fill="currentColor" className="w-3 h-3 text-white/50 ml-[1px]" />
                        </div>
                      )}
                    </div>
                    <p className={`text-[15px] leading-relaxed ${activeRowId === row.id ? 'text-white' : 'text-white/80'}`}>
                      {row.source}
                    </p>
                 </div>
               </div>

               {/* Right (Target) */}
               <div className="w-1/2 p-5 flex items-start">
                  <p className={`text-[15px] leading-relaxed ${activeRowId === row.id ? 'text-white/60' : 'text-white/40'}`}>
                    {row.target}
                  </p>
               </div>
             </div>
          ))}
        </div>
      </main>

      {/* Persistent floating action button */}
      <button className="fixed bottom-10 right-10 w-16 h-16 rounded-full bg-[#a855f7] shadow-lg flex items-center justify-center hover:scale-105 transition-transform">
        <Play fill="currentColor" className="w-7 h-7 text-white ml-2" />
      </button>

      {/* Fake purple scrollbar thumb indicator on far right edge overlay */}
      <div className="fixed right-0 top-[20%] w-1.5 h-32 bg-[#a855f7] rounded-l-md pointer-events-none" />
    </div>
  );
}
