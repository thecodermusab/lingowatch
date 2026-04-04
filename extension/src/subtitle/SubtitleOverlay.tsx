import React, { useState, useEffect, useRef, useCallback } from "react";
import { DualSubtitleStack } from "./DualSubtitleStack";
import { useSettings } from "./store";
import { SubtitlePayload } from "./types";
import { translate } from "./translate";

const YT_CAPTION_HIDE_ID = "lw-hide-yt-captions";

function setYtCaptionsHidden(hidden: boolean) {
  const existing = document.getElementById(YT_CAPTION_HIDE_ID);
  if (hidden && !existing) {
    const style = document.createElement("style");
    style.id = YT_CAPTION_HIDE_ID;
    // Hide YouTube's native caption window but keep our overlay visible
    style.textContent = `.ytp-caption-window-container { visibility: hidden !important; }`;
    document.head.appendChild(style);
  } else if (!hidden && existing) {
    existing.remove();
  }
}

export function SubtitleOverlay() {
  const [settings] = useSettings();
  const [sub, setSub] = useState<SubtitlePayload>({ original: "", translation: "" });
  const [visible, setVisible] = useState(false);
  const requestId = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setSub({ original: "", translation: "" });
    }, 300);
  }, []);

  useEffect(() => {
    const handle = async (e: Event) => {
      const { original = "", translation: preTranslated = "" } =
        (e as CustomEvent<SubtitlePayload>).detail ?? {};

      if (!original && !preTranslated) {
        scheduleHide();
        return;
      }

      // Cancel any pending hide when a new subtitle arrives
      if (hideTimer.current) clearTimeout(hideTimer.current);

      const id = ++requestId.current;
      setSub({ original, translation: preTranslated || "" });
      setVisible(true);

      if (!preTranslated && original) {
        const t = await translate(original);
        if (id !== requestId.current) return;
        setSub({ original, translation: t });
      }
    };

    window.addEventListener("lw:subtitle", handle);
    return () => window.removeEventListener("lw:subtitle", handle);
  }, [scheduleHide]);

  useEffect(() => {
    const shouldHide = settings.enabled && visible;
    setYtCaptionsHidden(shouldHide);
    return () => setYtCaptionsHidden(false);
  }, [settings.enabled, visible]);

  if (!settings.enabled) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: `${settings.bottomOffset}px`,
        transform: "translateX(-50%)",
        width: "min(94%, 1200px)",
        display: "flex",
        justifyContent: "center",
        zIndex: 2147483647,
        pointerEvents: "none",
        userSelect: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.12s ease",
      }}
    >
      <DualSubtitleStack
        original={sub.original}
        translation={sub.translation}
        settings={settings}
      />
    </div>
  );
}
