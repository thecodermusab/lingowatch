import React, { useState, useEffect, useRef } from "react";
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

  useEffect(() => {
    const handle = async (e: Event) => {
      const { original = "", translation: preTranslated = "" } =
        (e as CustomEvent<SubtitlePayload>).detail ?? {};

      if (!original && !preTranslated) {
        setVisible(false);
        setSub({ original: "", translation: "" });
        return;
      }

      const id = ++requestId.current;
      // Show original immediately
      setSub({ original, translation: preTranslated || "" });
      setVisible(true);

      // If subtitle.js has its own key, translate here; otherwise use whatever content.js sent
      if (!preTranslated && original) {
        const t = await translate(original);
        if (id !== requestId.current) return;
        setSub({ original, translation: t });
      }
    };

    window.addEventListener("lw:subtitle", handle);
    return () => window.removeEventListener("lw:subtitle", handle);
  }, []);

  // Hide YouTube's own captions whenever our overlay is active
  useEffect(() => {
    const shouldHide = settings.enabled && visible;
    setYtCaptionsHidden(shouldHide);
    return () => setYtCaptionsHidden(false);
  }, [settings.enabled, visible]);

  if (!settings.enabled || !visible) return null;

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
        pointerEvents: "none", // individual lines override this where needed
        userSelect: "none",
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
