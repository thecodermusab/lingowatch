import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { BOOK_ITEMS, BookItem } from "./bookData";

function BookCard({ book, index }: { book: BookItem; index: number }) {
  const loadImmediately = index < 8;

  return (
    <Link to={`/read/${book.id}`} className="block">
      <article className="group flex max-w-5xl cursor-pointer gap-6 border-b border-border px-6 py-6 transition-colors hover:bg-secondary/35">
        
        {/* Cover */}
        <div className="relative flex h-[150px] w-[100px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary shadow-lg">
          {book.coverUrl ? (
            <img
              src={book.coverUrl}
              alt={book.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading={loadImmediately ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={loadImmediately ? "high" : "auto"}
            />
          ) : (
            <>
              <div className="absolute inset-0 z-0 bg-cover bg-center blur-sm opacity-50" style={{ backgroundColor: book.coverColor }}></div>
              <div className="relative z-10 flex h-full w-full flex-col overflow-hidden border border-border/50 p-2" style={{ backgroundColor: book.coverColor }}>
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
          
          <p className="w-full line-clamp-3 pr-4 text-[15px] leading-[1.7] text-muted-foreground">
            <span className="font-semibold text-foreground mr-2 tracking-wide">{book.title}</span>
            <span className="mx-1 text-muted">•</span> {book.description}
          </p>

          {book.isSimplified && (
            <div className="flex gap-2 flex-wrap mt-4">
              <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                <BookOpen className="w-3 h-3 mb-0.5" /> Simplified
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
    <section className="flex flex-col flex-1 bg-background min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-primary/50 scrollbar-track-transparent">
      <div className="py-2 px-4 sm:px-8">
        {BOOK_ITEMS.map((book, index) => (
          <BookCard key={book.id} book={book} index={index} />
        ))}
      </div>
    </section>
  );
}
