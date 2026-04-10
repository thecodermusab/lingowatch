import { useState, useRef, useEffect } from "react";
import { X, Type, Globe, Loader2, Check, Eraser } from "lucide-react";

export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "red";

export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: "#eab308", // a bit darker for better contrast if needed, or stick to transparent
  green: "#22c55e",
  blue: "#3b82f6",
  pink: "#ec4899",
  red: "#ef4444",
};

export interface ExistingHighlight {
  id: string;
  color: HighlightColor;
  note?: string;
}

export interface AnnotationToolbarProps {
  x: number;
  y: number;
  selectedText?: string;
  existingHighlight?: ExistingHighlight;
  onSaveAnnotation: (color: HighlightColor, note: string, id?: string) => void;
  onDeleteAnnotation?: (id: string) => void;
  onTranslate?: () => Promise<string | null>;
  onClose: () => void;
}

export function AnnotationToolbar({
  x,
  y,
  selectedText,
  existingHighlight,
  onSaveAnnotation,
  onDeleteAnnotation,
  onTranslate,
  onClose,
}: AnnotationToolbarProps) {
  const [mode, setMode] = useState<"actions" | "note" | "translated">(
    existingHighlight && existingHighlight.note ? "note" : "actions"
  );
  const [selectedColor, setSelectedColor] = useState<HighlightColor>(
    existingHighlight?.color || "yellow"
  );
  const [note, setNote] = useState(existingHighlight?.note || "");
  const [translation, setTranslation] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose]);

  const handleTranslate = async () => {
    if (!onTranslate) return;
    setIsTranslating(true);
    const result = await onTranslate();
    if (result) {
      setTranslation(result);
      setMode("translated");
    }
    setIsTranslating(false);
  };

  const colors: HighlightColor[] = ["yellow", "green", "blue", "pink", "red"];

  return (
    <div
      ref={toolbarRef}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: x,
        top: Math.max(y - 64, 8),
        transform: "translateX(-50%)",
        zIndex: 60,
      }}
      className="bg-[#2B2D31] border border-[#3E4044] rounded-xl shadow-2xl overflow-hidden font-sans"
    >
      {mode === "translated" && translation ? (
        <div className="flex flex-col min-w-[200px] max-w-[280px]">
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5">
              Somali
            </p>
            <p className="text-[15px] text-white/90 font-medium leading-snug">
              {translation}
            </p>
          </div>
          <div className="flex border-t border-[#3E4044]">
            <button
              onClick={() => setMode("actions")}
              className="flex-1 px-3 py-2.5 text-[12px] text-white/70 hover:bg-white/5 transition-colors font-medium flex items-center justify-center"
            >
              Back to Highlighting
            </button>
            <button
              onClick={onClose}
              className="px-3 py-2.5 text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors border-l border-[#3E4044]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : mode === "note" ? (
        <div className="flex flex-col min-w-[240px] max-w-[280px]">
          <div className="px-3 py-3">
            <textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note..."
              className="w-full bg-[#1A1A1A] border border-[#3E4044] focus:border-[#a855f7] rounded-lg px-2.5 py-2 text-[13px] text-white/90 placeholder:text-white/30 resize-none outline-none"
              rows={2}
            />
            <div className="flex items-center gap-2 mt-3 mb-1 px-1">
              {colors.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  style={{ backgroundColor: HIGHLIGHT_COLORS[color] }}
                  className={`w-5 h-5 rounded-full transition-transform ${
                    selectedColor === color ? "scale-125 ring-2 ring-white/50" : "hover:scale-110"
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="flex border-t border-[#3E4044]">
             <button
              onClick={() => onSaveAnnotation(selectedColor, note, existingHighlight?.id)}
              className="flex-1 px-3 py-2 text-[12px] text-[#a855f7] hover:bg-[#a855f7]/10 transition-colors font-medium flex items-center justify-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" /> {existingHighlight ? "Update" : "Save"}
            </button>
            {existingHighlight && onDeleteAnnotation && (
              <button
                onClick={() => onDeleteAnnotation(existingHighlight.id)}
                className="px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-colors border-l border-[#3E4044]"
                title="Delete Annotation"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => setMode("actions")}
              className="px-3 py-2 text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors border-l border-[#3E4044]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center py-1">
           {/* Color Pickers */}
           <div className="flex items-center gap-2 px-3 border-r border-[#3E4044]">
              {colors.map((color) => (
                <button
                  key={color}
                  onClick={() => onSaveAnnotation(color, "")}
                  style={{ backgroundColor: HIGHLIGHT_COLORS[color] }}
                  className="w-5 h-5 rounded-full hover:scale-110 transition-transform hover:ring-2 hover:ring-white/30"
                />
              ))}
              
              {existingHighlight && onDeleteAnnotation && (
                <button
                  onClick={() => onDeleteAnnotation(existingHighlight.id)}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-white/5 transition-colors border border-dashed border-white/20 hover:border-red-400/50"
                  title="Erase Highlight"
                >
                  <Eraser className="w-3 h-3" />
                </button>
              )}
           </div>

           {/* Actions */}
           <div className="flex items-center px-1 border-r border-[#3E4044]">
             <button
               onClick={() => setMode("note")}
               className="p-2 text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors group flex items-center gap-1"
               title={existingHighlight?.note ? "View/Edit Note" : "Add Note"}
             >
               <Type className="w-4 h-4" />
             </button>
             
             {onTranslate && (!existingHighlight || selectedText) && (
               <button
                 onClick={handleTranslate}
                 disabled={isTranslating}
                 className="p-2 text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                 title="Translate Phrase"
               >
                 {isTranslating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
               </button>
             )}
           </div>

           {/* Close */}
           <button
              onClick={onClose}
              className="p-2 ml-1 mr-1 text-white/30 hover:text-white/70 hover:bg-white/5 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
        </div>
      )}
    </div>
  );
}
