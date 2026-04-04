import React from "react";

interface SubtitleLineProps {
  text: string;
  primary: boolean;
  fontSize: number;
  bgOpacity: number;
  subtitleContext?: string;
}

function cleanWord(raw: string): string {
  return raw.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, "").toLowerCase();
}

function handleWordClick(e: React.MouseEvent<HTMLSpanElement>, raw: string, subtitleContext: string) {
  const word = cleanWord(raw);
  if (!word) return;
  e.stopPropagation();
  const domRect = (e.currentTarget as HTMLSpanElement).getBoundingClientRect();
  window.dispatchEvent(
    new CustomEvent("lw:word-click", {
      detail: {
        word,
        subtitleContext,
        rect: {
          left: domRect.left,
          top: domRect.top,
          right: domRect.right,
          bottom: domRect.bottom,
          width: domRect.width,
          height: domRect.height,
        },
      },
    })
  );
}

function WordSpan({ token, fontSize, subtitleContext }: { token: string; fontSize: number; subtitleContext: string }) {
  const word = cleanWord(token);
  if (!word) {
    // punctuation / whitespace — render plain
    return <span style={{ whiteSpace: "pre" }}>{token}</span>;
  }
  return (
    <span
      onClick={(e) => handleWordClick(e as React.MouseEvent<HTMLSpanElement>, token, subtitleContext)}
      style={{
        cursor: "pointer",
        borderRadius: "2px",
        padding: "0 1px",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLSpanElement).style.background =
          "rgba(255,255,255,0.18)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLSpanElement).style.background = "";
      }}
    >
      {token}
    </span>
  );
}

export function SubtitleLine({ text, primary, fontSize, bgOpacity, subtitleContext = "" }: SubtitleLineProps) {
  if (!text.trim()) return null;

  const size = primary ? fontSize : Math.round(fontSize * 0.8);

  // Split into word/non-word tokens preserving spaces and punctuation
  const tokens = text.split(/(\s+)/);

  return (
    <div
      style={{
        display: "block",
        width: "100%",
        padding: primary ? "6px 20px 7px" : "4px 16px 5px",
        borderRadius: "4px",
        background: `rgba(8, 8, 8, ${bgOpacity})`,
        color: primary ? "#ffffff" : "#a3e635",
        fontSize: `${size}px`,
        fontWeight: primary ? 700 : 500,
        lineHeight: 1.4,
        fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, Arial, sans-serif',
        textShadow: primary
          ? "0 1px 6px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.8)"
          : "0 1px 3px rgba(0,0,0,0.8)",
        letterSpacing: "0.01em",
        wordBreak: "break-word",
        textAlign: "center",
        boxSizing: "border-box",
        // Enable clicks only on the primary (English) line
        pointerEvents: primary ? "auto" : "none",
      }}
    >
      {primary
        ? tokens.map((token, i) =>
            /^\s+$/.test(token) ? (
              <span key={i} style={{ whiteSpace: "pre" }}>{token}</span>
            ) : (
              <WordSpan key={i} token={token} fontSize={size} subtitleContext={subtitleContext} />
            )
          )
        : text}
    </div>
  );
}
