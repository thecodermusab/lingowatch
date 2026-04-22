import React from "react";

interface SyncedTtsTextProps {
  text: string;
  activeWordIndex: number | null;
  className?: string;
  wordClassName?: string;
  activeClassName?: string;
  inactiveClassName?: string;
  activeStyle?: React.CSSProperties;
  inactiveStyle?: React.CSSProperties;
  targetWords?: string[];
  onTargetWordClick?: (word: string) => void;
  targetWordClassName?: string;
  targetActiveClassName?: string;
  targetInactiveClassName?: string;
  targetActiveStyle?: React.CSSProperties;
  targetInactiveStyle?: React.CSSProperties;
}

const tokenPattern = /(\s+|\S+)/g;

function normalizeToken(token: string) {
  return token
    .toLowerCase()
    .replace(/^\W+|\W+$/g, "");
}

export function getActiveWordIndex(currentTime: number, starts: number[]): number | null {
  if (!starts.length) return null;

  for (let index = starts.length - 1; index >= 0; index -= 1) {
    if (currentTime >= starts[index]) return index;
  }

  return null;
}

export function SyncedTtsText({
  text,
  activeWordIndex,
  className = "",
  wordClassName = "",
  activeClassName = "",
  inactiveClassName = "",
  activeStyle,
  inactiveStyle,
  targetWords = [],
  onTargetWordClick,
  targetWordClassName = "",
  targetActiveClassName = "",
  targetInactiveClassName = "",
  targetActiveStyle,
  targetInactiveStyle,
}: SyncedTtsTextProps) {
  const tokens = text.match(tokenPattern) || [];
  const targetWordSet = new Set(targetWords.map((word) => normalizeToken(word)).filter(Boolean));
  let wordIndex = -1;

  return (
    <span className={className}>
      {tokens.map((token, tokenIndex) => {
        if (/^\s+$/.test(token)) {
          return <React.Fragment key={`space-${tokenIndex}`}>{token}</React.Fragment>;
        }

        wordIndex += 1;
        const isActive = activeWordIndex === wordIndex;
        const normalizedToken = normalizeToken(token);
        const isTargetWord = targetWordSet.has(normalizedToken);
        const resolvedClassName = isTargetWord
          ? `${wordClassName} ${targetWordClassName} ${isActive ? targetActiveClassName : targetInactiveClassName}`.trim()
          : `${wordClassName} ${isActive ? activeClassName : inactiveClassName}`.trim();
        const resolvedStyle = isTargetWord
          ? isActive
            ? (targetActiveStyle || activeStyle)
            : (targetInactiveStyle || inactiveStyle)
          : isActive
            ? activeStyle
            : inactiveStyle;

        if (isTargetWord && onTargetWordClick) {
          return (
            <button
              key={`word-${tokenIndex}`}
              type="button"
              onClick={() => onTargetWordClick(normalizedToken)}
              className={`word inline cursor-pointer bg-transparent p-0 text-inherit ${resolvedClassName}`.trim()}
              style={resolvedStyle}
            >
              {token}
            </button>
          );
        }

        return <span key={`word-${tokenIndex}`} className={`word ${resolvedClassName}`.trim()} style={resolvedStyle}>{token}</span>;
      })}
    </span>
  );
}
