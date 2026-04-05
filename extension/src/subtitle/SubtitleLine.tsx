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

function WordSpan({ token, subtitleContext }: { token: string; subtitleContext: string }) {
  const word = cleanWord(token);
  if (!word) return <span style={{ whiteSpace: "pre" }}>{token}</span>;
  return (
    <span
      onClick={(e) => handleWordClick(e as React.MouseEvent<HTMLSpanElement>, token, subtitleContext)}
      style={{ cursor: "pointer", borderRadius: "2px", padding: "0 1px", transition: "background 0.1s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.background = "rgba(255,255,255,0.18)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.background = ""; }}
    >
      {token}
    </span>
  );
}

export function SubtitleLine({ text, primary, fontSize, bgOpacity, subtitleContext = "" }: SubtitleLineProps) {
  const size = primary ? fontSize : Math.round(fontSize * 0.8);
  const tokens = text.split(/(\s+)/);

  return (
    <div
      style={{
        width: "100%",
        padding: primary ? "6px 20px 7px" : "4px 16px 5px",
        background: `rgba(8, 8, 8, ${bgOpacity})`,
        color: primary ? "#ffffff" : "#a3e635",
        fontSize: `${size}px`,
        fontWeight: primary ? 700 : 500,
        lineHeight: 1.4,
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
        textShadow: primary
          ? "0 1px 6px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.8)"
          : "0 1px 3px rgba(0,0,0,0.8)",
        letterSpacing: "0.01em",
        textAlign: "center",
        wordBreak: "break-word",
        boxSizing: "border-box",
        pointerEvents: primary ? "auto" : "none",
        // Reserve height for 2 lines to prevent vertical jumping
        minHeight: `calc(${size * 1.4 * 2}px + ${primary ? 13 : 9}px)`,
      }}
    >
      {primary
        ? tokens.map((token, i) =>
            /^\s+$/.test(token)
              ? <span key={i} style={{ whiteSpace: "pre" }}>{token}</span>
              : <WordSpan key={i} token={token} subtitleContext={subtitleContext} />
          )
        : text}
    </div>
  );
}
