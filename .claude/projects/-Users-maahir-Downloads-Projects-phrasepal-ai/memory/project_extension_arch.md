---
name: Extension Architecture (Milestone 1)
description: New React+TypeScript+ShadowDOM extension architecture replacing vanilla JS content.js
type: project
---

The extension was rebuilt with a React + TypeScript + Shadow DOM architecture.

**Why:** User wants Language Reactor-style UX quality — original implementation, not a copy.

**Build:**
- `npm run build:ext` → runs two Vite configs sequentially
- `vite.extension.content.config.ts` → `extension/dist/content.js` (IIFE, ~155KB, React inlined)
- `vite.extension.bg.config.ts` → `extension/dist/background.js` (ES module)
- Manifest now references `dist/content.js` and `dist/background.js`
- Content script only runs on `*://*.youtube.com/watch*`

**Architecture:**
- `extension/src/content/index.ts` — entry, guards double-inject, listens to `yt-navigate-finish`
- `extension/src/content/core.ts` — init/teardown orchestrator, 1.5s button presence poll
- `extension/src/content/store.ts` — module-level reactive store (singleton in IIFE scope), persists to chrome.storage.session
- `extension/src/content/youtube.ts` — YouTube DOM helpers, polls for `.ytp-left-controls`
- `extension/src/content/button.ts` — vanilla DOM button injected into YT control bar after `.ytp-time-display`
- `extension/src/content/sidebar.tsx` — Shadow DOM host + React mounting
- `extension/src/content/ui/` — React components (App, Sidebar, Header, panels)
- `extension/src/content/ui/sidebar.css` — imported as `?inline` string, injected into shadow root

**Style isolation:** Shadow DOM. Button uses a `<style>` tag injected into `document.head`.

**How to apply:** When adding features (subtitle sync, word click, vocab panel), extend the React components in `ui/` and wire data through the store pattern.
