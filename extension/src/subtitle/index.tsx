import React from "react";
import { createRoot } from "react-dom/client";
import { SubtitleOverlay } from "./SubtitleOverlay";

const HOST_ID = "lw-subtitle-root";

function findPlayer(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("#movie_player") ??
    document.querySelector<HTMLElement>(".html5-video-container") ??
    (document.querySelector<HTMLElement>("video")?.parentElement ?? null)
  );
}

let hostEl: HTMLDivElement | null = null;

function clearOverlay() {
  window.dispatchEvent(
    new CustomEvent("lw:subtitle", {
      detail: { original: "", translation: "" },
    }),
  );
}

function ensureOverlay(): boolean {
  const player = findPlayer();
  if (!player) return false;

  if (window.getComputedStyle(player).position === "static") {
    player.style.position = "relative";
  }

  if (!hostEl) {
    hostEl = document.createElement("div");
    hostEl.id = HOST_ID;
    hostEl.style.cssText =
      "position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:2147483646;";
    const root = createRoot(hostEl);
    root.render(<SubtitleOverlay />);
  }

  if (hostEl.parentElement !== player) {
    player.appendChild(hostEl);
  }

  return true;
}

function tryMount(retries = 15) {
  if (ensureOverlay()) return;
  if (retries > 0) setTimeout(() => tryMount(retries - 1), 300);
}

window.addEventListener("yt-navigate-start", () => {
  clearOverlay();
});

window.addEventListener("yt-navigate-finish", () => {
  tryMount();
  setTimeout(() => tryMount(), 600);
});

window.addEventListener("yt-page-data-updated", () => {
  tryMount();
});

// Reliable fallback: every second check if the overlay is attached to the
// current player. Catches new-tab → click-video where events fire before
// the player element exists.
setInterval(() => {
  const player = findPlayer();
  if (!player) return;
  if (!hostEl || hostEl.parentElement !== player) {
    ensureOverlay();
  }
}, 1000);

tryMount();
