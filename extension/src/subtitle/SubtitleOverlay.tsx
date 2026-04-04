import React, { useEffect, useRef } from "react";
import { SubtitlePayload } from "./types";
import { DEFAULT_SETTINGS, SubtitleSettings } from "./types";
import { translate } from "./translate";

const YT_CAPTION_HIDE_ID = "lw-hide-yt-captions";

function setYtCaptionsHidden(hidden: boolean) {
  const existing = document.getElementById(YT_CAPTION_HIDE_ID);
  if (hidden && !existing) {
    const style = document.createElement("style");
    style.id = YT_CAPTION_HIDE_ID;
    style.textContent = `.ytp-caption-window-container { visibility: hidden !important; }`;
    document.head.appendChild(style);
  } else if (!hidden && existing) {
    existing.remove();
  }
}

function cleanWord(raw: string): string {
  return raw.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, "").toLowerCase();
}

function setEnglishText(div: HTMLDivElement, text: string) {
  const tokens = text.split(/(\s+)/);
  const fragment = document.createDocumentFragment();
  for (const token of tokens) {
    const span = document.createElement("span");
    if (/^\s+$/.test(token)) {
      span.style.whiteSpace = "pre";
      span.textContent = token;
    } else {
      const word = cleanWord(token);
      span.textContent = token;
      if (word) {
        span.style.cursor = "pointer";
        span.style.borderRadius = "2px";
        span.style.padding = "0 1px";
        span.dataset.word = word;
        span.dataset.context = text;
        span.addEventListener("mouseenter", () => { span.style.background = "rgba(255,255,255,0.18)"; });
        span.addEventListener("mouseleave", () => { span.style.background = ""; });
      }
    }
    fragment.appendChild(span);
  }
  div.replaceChildren(fragment);
}

function applySettings(
  containerEl: HTMLDivElement,
  englishEl: HTMLDivElement,
  translationEl: HTMLDivElement,
  settings: SubtitleSettings,
  enabled: boolean
) {
  const { fontSize, bgOpacity, bottomOffset } = settings;
  const translationSize = Math.round(fontSize * 0.8);

  containerEl.style.display = enabled ? "flex" : "none";
  containerEl.style.bottom = `${bottomOffset}px`;

  englishEl.style.fontSize = `${fontSize}px`;
  englishEl.style.background = `rgba(8,8,8,${bgOpacity})`;

  translationEl.style.fontSize = `${translationSize}px`;
  translationEl.style.background = `rgba(8,8,8,${bgOpacity})`;

  if (!enabled) setYtCaptionsHidden(false);
}

export function SubtitleOverlay() {
  const containerRef = useRef<HTMLDivElement>(null);
  const englishRef = useRef<HTMLDivElement>(null);
  const translationRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const shown = useRef(false);
  // Settings stored in a ref — reads/writes never trigger React re-renders
  const settingsRef = useRef<SubtitleSettings>({ ...DEFAULT_SETTINGS });

  // One-time setup: load settings, subscribe to changes, wire up all events.
  // No React state is ever set after this point — React renders this component
  // exactly once and all updates go directly to DOM via refs.
  useEffect(() => {
    const container = containerRef.current!;
    const englishEl = englishRef.current!;
    const translationEl = translationRef.current!;

    // Start hidden until first subtitle arrives
    container.style.visibility = "hidden";

    // Load stored settings
    chrome.storage.local.get("subtitleSettings", (r) => {
      if (r.subtitleSettings) {
        settingsRef.current = { ...DEFAULT_SETTINGS, ...r.subtitleSettings, enabled: true };
      }
      applySettings(container, englishEl, translationEl, settingsRef.current, settingsRef.current.enabled);
    });

    // React to settings changes from popup — pure DOM, no setState
    const onStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area !== "local" || !changes.subtitleSettings) return;
      const next: SubtitleSettings = { ...DEFAULT_SETTINGS, ...changes.subtitleSettings.newValue };
      settingsRef.current = next;
      applySettings(container, englishEl, translationEl, next, next.enabled);
    };
    chrome.storage.onChanged.addListener(onStorageChange);

    // Subtitle text updates
    const onSubtitle = async (e: Event) => {
      const { original = "", translation: preTranslated = "" } =
        (e as CustomEvent<SubtitlePayload>).detail ?? {};

      if (!original && !preTranslated) return;
      if (!settingsRef.current.enabled) return;

      const id = ++requestId.current;

      // Make container visible on first subtitle — done once, never reset
      if (!shown.current) {
        shown.current = true;
        container.style.visibility = "visible";
        setYtCaptionsHidden(true);
      }

      setEnglishText(englishEl, original);

      if (preTranslated) {
        translationEl.textContent = preTranslated;
        return;
      }

      const t = await translate(original);
      if (id !== requestId.current) return;
      translationEl.textContent = t;
    };
    window.addEventListener("lw:subtitle", onSubtitle);

    // Word click delegation
    const onWordClick = (e: MouseEvent) => {
      const span = (e.target as Element).closest("[data-word]") as HTMLElement | null;
      if (!span?.dataset.word) return;
      e.stopPropagation();
      const rect = span.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent("lw:word-click", {
        detail: {
          word: span.dataset.word,
          subtitleContext: span.dataset.context || "",
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        },
      }));
    };
    englishEl.addEventListener("click", onWordClick);

    return () => {
      chrome.storage.onChanged.removeListener(onStorageChange);
      window.removeEventListener("lw:subtitle", onSubtitle);
      englishEl.removeEventListener("click", onWordClick);
      setYtCaptionsHidden(false);
    };
  }, []); // empty deps — runs once, never re-runs

  // Static JSX — React renders this exactly once.
  // All dynamic updates go through DOM refs above.
  // visibility is intentionally absent from style — managed via ref only.
  const { fontSize, bgOpacity, bottomOffset } = DEFAULT_SETTINGS;
  const translationSize = Math.round(fontSize * 0.8);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        left: "50%",
        bottom: `${bottomOffset}px`,
        transform: "translateX(-50%)",
        maxWidth: "min(92%, 1100px)",
        zIndex: 2147483647,
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        // visibility and bottom managed via ref only — never set here
      }}
    >
      <div
        ref={englishRef}
        style={{
          maxWidth: "min(92vw, 1100px)",
          padding: "6px 20px 7px",
          background: `rgba(8,8,8,${bgOpacity})`,
          color: "#ffffff",
          fontSize: `${fontSize}px`,
          fontWeight: 700,
          lineHeight: 1.4,
          fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, Arial, sans-serif',
          textShadow: "0 1px 6px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.8)",
          textAlign: "center",
          wordBreak: "break-word",
          boxSizing: "border-box",
          pointerEvents: "auto",
        }}
      />
      <div
        ref={translationRef}
        style={{
          maxWidth: "min(92vw, 1100px)",
          padding: "4px 16px 5px",
          background: `rgba(8,8,8,${bgOpacity})`,
          color: "#a3e635",
          fontSize: `${translationSize}px`,
          fontWeight: 500,
          lineHeight: 1.4,
          fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, Arial, sans-serif',
          textShadow: "0 1px 3px rgba(0,0,0,0.8)",
          textAlign: "center",
          wordBreak: "break-word",
          boxSizing: "border-box",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
