import React from "react";
import { createRoot } from "react-dom/client";
import { SubtitleOverlay } from "./SubtitleOverlay";

const HOST_ID = "lw-subtitle-root";

// Seed build-time keys into chrome.storage so content.js can read them
const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY as string | undefined;
if (GEMINI_KEY) chrome.storage.local.set({ geminiApiKey: GEMINI_KEY });

function findPlayer(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("#movie_player") ??
    document.querySelector<HTMLElement>(".html5-video-container") ??
    (document.querySelector<HTMLElement>("video")?.parentElement ?? null)
  );
}

function mountOverlay() {
  if (document.getElementById(HOST_ID)) return;

  const player = findPlayer();
  if (!player) return;

  if (window.getComputedStyle(player).position === "static") {
    player.style.position = "relative";
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  // Stretch over the player, don't block pointer events on the host
  host.style.cssText =
    "position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:2147483646;";
  player.appendChild(host);

  const root = createRoot(host);
  root.render(<SubtitleOverlay />);
}

function tryMount(retries = 20) {
  if (document.getElementById(HOST_ID)) return;
  const player = findPlayer();
  if (player) {
    mountOverlay();
  } else if (retries > 0) {
    setTimeout(() => tryMount(retries - 1), 500);
  }
}

// Reinitialise on YouTube SPA navigation
window.addEventListener("yt-navigate-finish", () => {
  document.getElementById(HOST_ID)?.remove();
  setTimeout(() => tryMount(), 800);
});

// Clear subtitle when navigating away
window.addEventListener("yt-navigate-start", () => {
  window.dispatchEvent(
    new CustomEvent("lw:subtitle", { detail: { original: "", translation: "" } })
  );
});

tryMount();
