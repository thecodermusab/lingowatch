import { useState, useEffect } from "react";
import { SubtitleSettings, DEFAULT_SETTINGS } from "./types";

export function useSettings(): [SubtitleSettings, (patch: Partial<SubtitleSettings>) => void] {
  const [s, setS] = useState<SubtitleSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    chrome.storage.local.get("subtitleSettings", (r) => {
      if (r.subtitleSettings) {
        setS({ ...DEFAULT_SETTINGS, ...r.subtitleSettings });
      }
    });

    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area === "local" && changes.subtitleSettings) {
        setS({ ...DEFAULT_SETTINGS, ...changes.subtitleSettings.newValue });
      }
    };

    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const update = (patch: Partial<SubtitleSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    chrome.storage.local.set({ subtitleSettings: next });
  };

  return [s, update];
}
