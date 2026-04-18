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
}

const tokenPattern = /(\s+|\S+)/g;

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
}: SyncedTtsTextProps) {
  const tokens = text.match(tokenPattern) || [];
  let wordIndex = -1;

  return (
    <span className={className}>
      {tokens.map((token, tokenIndex) => {
        if (/^\s+$/.test(token)) {
          return <React.Fragment key={`space-${tokenIndex}`}>{token}</React.Fragment>;
        }

        wordIndex += 1;
        const isActive = activeWordIndex === wordIndex;

        return (
          <span
            key={`word-${tokenIndex}`}
            className={`word ${wordClassName} ${isActive ? activeClassName : inactiveClassName}`.trim()}
            style={isActive ? activeStyle : inactiveStyle}
          >
            {token}
          </span>
        );
      })}
    </span>
  );
}
