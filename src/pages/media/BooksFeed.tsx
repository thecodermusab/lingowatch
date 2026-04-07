import { Link } from "react-router-dom";
import { BOOK_ITEMS, BookItem } from "./bookData";

function vocabBarFill(score: number): number {
  return Math.min(100, Math.round((score / 20000) * 100));
}

function VocabBar({ score }: { score: number }) {
  const fill = vocabBarFill(score);

  return (
    <div className="flex items-center gap-3">
      <div className="h-[3px] w-20 overflow-hidden rounded-full bg-[#3e3e3e]">
        <div
          className="h-full rounded-full bg-[#a855f7]"
          style={{ width: `${fill}%` }}
        />
      </div>
      <span className="text-[12px] text-[#888888]">#{score.toLocaleString()}</span>
    </div>
  );
}

function BookCard({ book, index }: { book: BookItem; index: number }) {
  const isAlt = index % 2 === 1;

  return (
    <Link to={`/read/${book.id}`} className="block">
      <article className={`flex gap-6 border-b border-[#3e3e3e] py-6 pr-8 pl-4 transition-colors hover:brightness-110 ${isAlt ? 'bg-[#222222]' : 'bg-[#1a1a1a]'}`}>
      <div className="text-[14px] text-white/30 pt-1 w-4 text-center shrink-0">
        {index}
      </div>
      
      <div className="h-[180px] w-[120px] shrink-0 overflow-hidden rounded shadow-[0_4px_12px_rgba(0,0,0,0.5)] flex items-center justify-center relative bg-white/5">
        {book.coverUrl ? (
          <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
        ) : (
          <>
            <div className="absolute inset-0 z-0 bg-cover bg-center blur-sm opacity-50" style={{ backgroundColor: book.coverColor }}></div>
            <div className="relative z-10 w-full h-full flex flex-col p-3 overflow-hidden border border-white/10" style={{ backgroundColor: book.coverColor }}>
               <h4 className="text-black/80 font-serif font-bold text-[10px] uppercase text-center leading-tight mb-2 tracking-widest">{book.title}</h4>
               {/* Fallback geometric shape to mimic a book cover graphic */}
               <div className="flex-1 flex items-center justify-center opacity-60">
                 <div className="w-12 h-16 border-2 border-black/40 flex flex-col items-center justify-end pb-2">
                     <div className="w-6 h-6 border-2 border-black/40 rounded-full"></div>
                 </div>
               </div>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-start">
        {book.isSimplified && (
          <div className="mb-2.5">
            <span className="inline-flex items-center gap-1.5 rounded border border-[#6b7280] px-2 py-0.5 text-[11px] font-medium text-[#c0c6d4]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                <path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
              Simplified version
            </span>
          </div>
        )}
        
        <h3 className="text-[18px] font-medium text-white/90">
          {book.title}
        </h3>
        
        <p className="mt-1 text-[13px] text-[#888888]">
          {book.authors}
        </p>
        
        <p className="mt-3.5 text-[14px] leading-relaxed text-[#c0c0c0] max-w-3xl line-clamp-2">
          {book.description}
        </p>

        <div className="mt-auto pt-4 flex items-center gap-6">
          <VocabBar score={book.vocabScore} />
          <span className="text-[13px] text-[#888888]">{book.pageCount} pages</span>
        </div>
      </div>
    </article>
    </Link>
  );
}

export function BooksFeed() {
  return (
    <section className="flex flex-col flex-1 bg-[#1a1a1a] min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-[#a855f7] scrollbar-track-transparent">
      <div className="p-4">
        {BOOK_ITEMS.map((book, i) => (
          <BookCard key={book.id} book={book} index={i + 1} />
        ))}
      </div>
    </section>
  );
}
