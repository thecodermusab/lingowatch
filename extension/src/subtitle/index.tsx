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

// Single persistent host + root — never destroyed, just moved between players
let hostEl: HTMLDivElement | null = null;

function clearOverlay() {
  window.dispatchEvent(
    new CustomEvent("lw:subtitle", {
      detail: { original: "", translation: "" },
    }),
  );
}

function ensureOverlay() {
  const player = findPlayer();
  if (!player) return false;

  if (window.getComputedStyle(player).position === "static") {
    player.style.position = "relative";
  }

  if (!hostEl) {
    // First time: create host and React root
    hostEl = document.createElement("div");
    hostEl.id = HOST_ID;
    hostEl.style.cssText =
      "position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:2147483646;";
    const root = createRoot(hostEl);
    root.render(<SubtitleOverlay />);
  }

  // Move host to current player if it's detached or in a different player
  if (hostEl.parentElement !== player) {
    player.appendChild(hostEl);
  }

  return true;
}

function tryMount(retries = 20) {
  if (ensureOverlay()) return;
  if (retries > 0) setTimeout(() => tryMount(retries - 1), 300);
}

// On SPA navigation: move the existing overlay to the new player immediately
window.addEventListener("yt-navigate-start", () => {
  clearOverlay();
});

window.addEventListener("yt-navigate-finish", () => {
  if (!ensureOverlay()) setTimeout(() => tryMount(), 300);
});

tryMount();
