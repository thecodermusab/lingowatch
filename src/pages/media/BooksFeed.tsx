import { Link } from "react-router-dom";
import { BOOK_ITEMS, BookItem } from "./bookData";

function BookCard({ book }: { book: BookItem }) {
  return (
    <Link to={`/read/${book.id}`} className="block">
      <article className="flex gap-6 border-b border-white/5 py-6 px-6 transition-colors hover:bg-white/[0.02] bg-transparent group cursor-pointer max-w-5xl">
        
        {/* Cover */}
        <div className="h-[150px] w-[100px] shrink-0 overflow-hidden rounded-md shadow-lg flex items-center justify-center relative bg-white/5">
          {book.coverUrl ? (
            <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <>
              <div className="absolute inset-0 z-0 bg-cover bg-center blur-sm opacity-50" style={{ backgroundColor: book.coverColor }}></div>
              <div className="relative z-10 w-full h-full flex flex-col p-2 overflow-hidden border border-white/10" style={{ backgroundColor: book.coverColor }}>
                 <h4 className="text-black/80 font-serif font-bold text-[9px] uppercase text-center leading-tight mb-1 tracking-widest">{book.title}</h4>
                 <div className="flex-1 flex items-center justify-center opacity-60">
                   <div className="w-8 h-10 border-2 border-black/40 flex flex-col items-center justify-end pb-1">
                       <div className="w-4 h-4 border-2 border-black/40 rounded-full"></div>
                   </div>
                 </div>
              </div>
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col justify-center">
          
          <p className="text-[15px] leading-[1.7] text-[#9ca3af] line-clamp-3 w-full pr-4">
            <span className="font-semibold text-[#f3f4f6] mr-2 tracking-wide">{book.title}</span>
            <span className="mx-1 text-[#4b5563]">•</span> {book.description}
          </p>

          {book.isSimplified && (
            <div className="mt-4">
              <span className="inline-flex items-center gap-1 rounded-sm border border-[#3f3f46] bg-[#27272a] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] text-[#a1a1aa]">
                Simplified
              </span>
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}

export function BooksFeed() {
  return (
    <section className="flex flex-col flex-1 bg-[#121212] min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-[#a855f7] scrollbar-track-transparent">
      <div className="py-2">
        {BOOK_ITEMS.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
      </div>
    </section>
  );
}
