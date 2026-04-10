import React from "react";
import { HighlightColor, HIGHLIGHT_COLORS } from "./AnnotationToolbar";

export interface TextHighlight {
  id: string;
  start: number;
  end: number;
  color: HighlightColor;
  note?: string;
}

export interface HighlightableTextProps {
  text: string;
  highlights: TextHighlight[];
  onHighlightClick?: (highlight: TextHighlight, event: React.MouseEvent) => void;
  renderText?: (text: string, isHighlighted: boolean) => React.ReactNode;
}

export function HighlightableText({
  text,
  highlights,
  onHighlightClick,
  renderText = (t, _isHl) => t,
}: HighlightableTextProps) {
  // Sort and resolve overlaps (simplistic approach: first come first serve, or just sort by start index)
  // For robustness, we will create non-overlapping chunks.
  
  const sortedHighlights = [...highlights].sort((a, b) => a.start - b.start);
  
  const chunks: { text: string; highlight?: TextHighlight }[] = [];
  let currentIndex = 0;

  for (const hl of sortedHighlights) {
    if (hl.start > currentIndex) {
      // Normal chunk before the highlight
      chunks.push({
        text: text.slice(currentIndex, hl.start),
      });
    }

    if (hl.end > currentIndex) {
      // Highlight chunk
      const start = Math.max(currentIndex, hl.start);
      const end = hl.end;
      chunks.push({
        text: text.slice(start, end),
        highlight: hl,
      });
      currentIndex = end;
    }
  }

  // Remaining normal chunk
  if (currentIndex < text.length) {
    chunks.push({
      text: text.slice(currentIndex),
    });
  }

  return (
    <>
      {chunks.map((chunk, i) => {
        if (chunk.highlight) {
          const hasNote = chunk.highlight.note && chunk.highlight.note.length > 0;
          return (
            <span
              key={i}
              onClick={(e) => {
                if (onHighlightClick) onHighlightClick(chunk.highlight!, e);
              }}
              style={{
                backgroundColor: `${HIGHLIGHT_COLORS[chunk.highlight.color]}40`, // 40 hex is 25% opacity
                borderBottom: hasNote ? `2px dashed ${HIGHLIGHT_COLORS[chunk.highlight.color]}` : "none",
                cursor: onHighlightClick ? "pointer" : "text",
              }}
              className="relative inline transition-colors hover:opacity-80 box-decoration-clone"
              title={hasNote ? chunk.highlight.note : undefined}
            >
              {renderText(chunk.text, true)}
            </span>
          );
        }

        return <React.Fragment key={i}>{renderText(chunk.text, false)}</React.Fragment>;
      })}
    </>
  );
}
