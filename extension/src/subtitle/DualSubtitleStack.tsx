import React from "react";
import { SubtitleLine } from "./SubtitleLine";
import { SubtitleSettings } from "./types";

interface DualSubtitleStackProps {
  original: string;
  translation: string;
  settings: SubtitleSettings;
}

export function DualSubtitleStack({ original, translation, settings }: DualSubtitleStackProps) {
  const { mode, order, fontSize, bgOpacity, lineSpacing } = settings;

  const showOriginal = mode !== "translation";
  const showTranslation = mode !== "original";
  const originalOnTop = order === "original-top";

  type Line = { text: string; primary: boolean };
  const lines: Line[] = [];

  if (originalOnTop) {
    if (showOriginal && original) lines.push({ text: original, primary: true });
    if (showTranslation && translation) lines.push({ text: translation, primary: false });
  } else {
    if (showTranslation && translation) lines.push({ text: translation, primary: true });
    if (showOriginal && original) lines.push({ text: original, primary: false });
  }

  if (!lines.length) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: `${lineSpacing}px`,
        width: "100%",
      }}
    >
      {lines.map((l, i) => (
        <SubtitleLine
          key={i}
          text={l.text}
          primary={l.primary}
          fontSize={fontSize}
          bgOpacity={bgOpacity}
          subtitleContext={original}
        />
      ))}
    </div>
  );
}
