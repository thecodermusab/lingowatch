export interface SubtitleSettings {
  mode: "dual" | "original" | "translation";
  order: "original-top" | "translation-top";
  fontSize: number;     // px, 14–36, default 22
  bottomOffset: number; // px from player bottom, default 60
  bgOpacity: number;    // 0–1, default 0.82
  lineSpacing: number;  // px gap between lines, default 6
  enabled: boolean;
}

export const DEFAULT_SETTINGS: SubtitleSettings = {
  mode: "dual",
  order: "original-top",
  fontSize: 22,
  bottomOffset: 60,
  bgOpacity: 0.82,
  lineSpacing: 6,
  enabled: true,
};

export interface SubtitlePayload {
  original: string;
  translation: string;
}
