(function initLingoWatch() {
  if (window.__lingoWatchLoaded) {
    return;
  }

  window.__lingoWatchLoaded = true;
  console.log("LingoWatch loaded");

  const BACKEND_BASE_URL = "http://127.0.0.1:8000";
  const YOUTUBE_HOST_PATTERN = /(^|\.)youtube\.com$/i;
  const state = {
    subtitles: [],
    currentIndex: -1,
    autoPause: false,
    sidebarOpen: false,
    activeTab: "subtitles",
    currentVideo: null,
    currentSubtitleKey: "",
    currentSubtitleUrl: "",
    subtitleSource: "",
    translationCache: Object.create(null),
    frequencyData: {},
    ignoredWords: new Set(),
    starredLines: new Set(),
    overlayRequestId: 0,
    popupRequestId: 0,
    hoverTimer: null,
    noSubtitleTimer: null,
    wordInputTimer: null,
    attachVideoTimer: null,
    videoSyncCleanup: null,
    sidebarLayoutCleanup: null,
    trackObserverCleanup: null,
    trackedVideo: null,
    lastPopupAiData: null,
    lastPopupSynonyms: [],
    lastPopupAntonyms: [],
    elements: {}
  };

  const groupLabels = [
    "Rank 1-1000",
    "Rank 1001-3000",
    "Rank 3001-5000",
    "Rank 5001-8000",
    "Rank 8001+"
  ];

  loadFrequencyData();
  setupMessaging();
  setupKeyboardShortcuts();
  watchPageChanges();
  attemptAttachVideo();

  function setupMessaging() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "SUBTITLE_URL_FOUND") {
        handleSubtitleUrl(message.url);
        return;
      }

      if (message.type === "LW_TOGGLE_SIDEBAR") {
        const video = findBestVideo();
        if (!video) {
          sendResponse({ ok: false });
          return;
        }

        bindVideo(video);
        toggleSidebar(!state.sidebarOpen);
        sendResponse({ ok: true, open: state.sidebarOpen });
      }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes.savedWords && state.elements.savedList) {
        renderSavedTab();
      }
    });
  }

  function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (event) => {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || event.target.isContentEditable) {
          return;
        }
      }

      const video = state.currentVideo;
      if (!video || !state.subtitles.length) {
        return;
      }

      if (event.key === "a" || event.key === "A") {
        const current = state.subtitles[state.currentIndex];
        if (current) {
          state.currentIndex = -1;
          video.currentTime = current.start;
          video.play().catch(() => {});
        }
      }

      if (event.key === "d" || event.key === "D") {
        const next = state.subtitles[Math.min(state.currentIndex + 1, state.subtitles.length - 1)];
        if (next) {
          state.currentIndex = -1;
          video.currentTime = next.start;
        }
      }

      if (event.key === "s" || event.key === "S") {
        state.autoPause = !state.autoPause;
        showToast(state.autoPause ? "Auto-pause ON" : "Auto-pause OFF");
      }
    });
  }

  function watchPageChanges() {
    const observer = new MutationObserver(() => {
      clearTimeout(state.attachVideoTimer);
      state.attachVideoTimer = setTimeout(() => {
        attemptAttachVideo();
      }, 150);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    const wrapHistoryMethod = (method) => {
      const original = history[method];
      history[method] = function wrappedHistoryMethod(...args) {
        const result = original.apply(this, args);
        setTimeout(() => {
          resetSubtitleState();
          attemptAttachVideo(true);
        }, 300);
        return result;
      };
    };

    wrapHistoryMethod("pushState");
    wrapHistoryMethod("replaceState");
    window.addEventListener("popstate", () => {
      setTimeout(() => {
        resetSubtitleState();
        attemptAttachVideo(true);
      }, 300);
    });
  }

  function resetSubtitleState() {
    clearTimeout(state.noSubtitleTimer);
    state.currentSubtitleKey = "";
    state.currentSubtitleUrl = "";
    state.subtitleSource = "";
    state.subtitles = [];
    state.currentIndex = -1;
  }

  function attemptAttachVideo(forceReload = false) {
    const bestVideo = findBestVideo();
    if (!bestVideo) {
      return;
    }

    bindVideo(bestVideo, forceReload);
  }

  function findBestVideo() {
    const videos = Array.from(document.querySelectorAll("video"));
    if (!videos.length) {
      return null;
    }

    return videos
      .filter((video) => video.isConnected)
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
      })[0] || null;
  }

  function bindVideo(video, forceReload = false) {
    if (state.currentVideo === video && !forceReload) {
      return;
    }

    if (state.currentVideo !== video) {
      cleanupVideoBindings();
    }

    state.currentVideo = video;
    state.currentIndex = -1;

    ensureInterface();
    attachOverlay(video);
    attachLButton();
    injectQuickSaveModal();
    loadSubtitlesForCurrentPage(forceReload);
    bindVideoSync(video);
    bindSidebarLayout(video);
  }

  function cleanupVideoBindings() {
    state.videoSyncCleanup?.();
    state.videoSyncCleanup = null;
    state.sidebarLayoutCleanup?.();
    state.sidebarLayoutCleanup = null;
    state.trackObserverCleanup?.();
    state.trackObserverCleanup = null;
    state.trackedVideo = null;
  }

  function bindVideoSync(video) {
    state.videoSyncCleanup?.();

    const sync = () => {
      syncCurrentSubtitle();
    };

    const eventNames = ["timeupdate", "seeked", "loadedmetadata", "play", "pause"];
    eventNames.forEach((eventName) => {
      video.addEventListener(eventName, sync);
    });

    state.videoSyncCleanup = () => {
      eventNames.forEach((eventName) => {
        video.removeEventListener(eventName, sync);
      });
    };

    sync();
  }

  function bindSidebarLayout(video) {
    const sidebar = state.elements.sidebar;
    if (!sidebar || !video) {
      return;
    }

    state.sidebarLayoutCleanup?.();
    const secondaryInner = isYouTubePage() ? document.querySelector("#secondary-inner") : null;
    const previousSecondaryInnerPosition = secondaryInner?.style.position || "";
    const previousSecondaryInnerTop = secondaryInner?.style.top || "";
    const previousSecondaryInnerOverflow = secondaryInner?.style.overflow || "";

    if (secondaryInner) {
      secondaryInner.style.setProperty("position", "static", "important");
      secondaryInner.style.setProperty("top", "auto", "important");
      secondaryInner.style.setProperty("overflow", "visible", "important");
    }

    const syncLayout = () => {
      if (!sidebar.isConnected) {
        return;
      }

      if (!isYouTubePage()) {
        sidebar.style.setProperty("position", "fixed", "important");
        sidebar.style.setProperty("right", "0", "important");
        sidebar.style.setProperty("left", "auto", "important");
        sidebar.style.setProperty("top", "0", "important");
        sidebar.style.setProperty("bottom", "auto", "important");
        sidebar.style.setProperty("width", "360px", "important");
        sidebar.style.setProperty("height", "100vh", "important");
        sidebar.style.setProperty("min-height", "100vh", "important");
        sidebar.style.setProperty("max-height", "100vh", "important");
        sidebar.style.removeProperty("visibility");
        sidebar.style.removeProperty("pointer-events");
        return;
      }

      const rect = video.getBoundingClientRect();
      const playerVisible = rect.bottom > 72 && rect.top < window.innerHeight - 72 && rect.width > 0 && rect.height > 0;

      sidebar.style.setProperty("position", "sticky", "important");
      sidebar.style.setProperty("top", "56px", "important");
      sidebar.style.removeProperty("left");
      sidebar.style.removeProperty("right");
      sidebar.style.removeProperty("bottom");
      sidebar.style.setProperty("width", "100%", "important");
      sidebar.style.setProperty("height", "574px", "important");
      sidebar.style.setProperty("min-height", "574px", "important");
      sidebar.style.setProperty("max-height", "574px", "important");
      sidebar.style.setProperty("margin-bottom", "16px", "important");
      sidebar.style.setProperty("visibility", playerVisible ? "visible" : "hidden", "important");
      sidebar.style.setProperty("pointer-events", playerVisible ? "auto" : "none", "important");
    };

    syncLayout();

    const resizeObserver = new ResizeObserver(() => {
      syncLayout();
    });
    resizeObserver.observe(video);

    const onWindowResize = () => syncLayout();
    window.addEventListener("resize", onWindowResize);
    window.addEventListener("scroll", onWindowResize, { passive: true });

    state.sidebarLayoutCleanup = () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("scroll", onWindowResize);
      if (secondaryInner) {
        if (previousSecondaryInnerPosition) {
          secondaryInner.style.setProperty("position", previousSecondaryInnerPosition);
        } else {
          secondaryInner.style.removeProperty("position");
        }

        if (previousSecondaryInnerTop) {
          secondaryInner.style.setProperty("top", previousSecondaryInnerTop);
        } else {
          secondaryInner.style.removeProperty("top");
        }

        if (previousSecondaryInnerOverflow) {
          secondaryInner.style.setProperty("overflow", previousSecondaryInnerOverflow);
        } else {
          secondaryInner.style.removeProperty("overflow");
        }
      }
    };
  }

  function ensureInterface() {
    if (state.elements.sidebar) {
      // Re-inject if YouTube SPA navigation removed our node from the DOM
      if (!state.elements.sidebar.isConnected) {
        injectSidebar(state.elements.sidebar);
      }
      return;
    }

    const sidebar = document.createElement("aside");
    sidebar.id = "lw-sidebar";
    sidebar.className = "lw-hidden";
    sidebar.innerHTML = `
      <div class="lw-header">
        <div class="lw-header-top">
          <div class="lw-brand">
            <span class="lw-brand-kicker">Workspace</span>
            <span class="lw-brand-title">Lingowatch</span>
            <span class="lw-brand-subtitle">Watch, save, learn</span>
          </div>
          <div class="lw-header-actions">
            <button type="button" class="lw-icon-button" data-action="settings" aria-label="Shortcuts">⌘</button>
            <button type="button" class="lw-icon-button" data-action="close" aria-label="Close">✕</button>
          </div>
        </div>
        <div class="lw-tabs">
          <button type="button" class="lw-tab active" data-tab="subtitles">Subtitles</button>
          <button type="button" class="lw-tab" data-tab="words">Vocabulary</button>
          <button type="button" class="lw-tab" data-tab="saved">Saved</button>
        </div>
      </div>
      <div class="lw-panels">
        <section class="lw-panel active" data-panel="subtitles">
          <div id="lw-subtitle-list" class="lw-subtitle-list">
            <p class="lw-empty">Loading subtitles...</p>
          </div>
        </section>
        <section class="lw-panel" data-panel="words">
          <div id="lw-words-panel"></div>
        </section>
        <section class="lw-panel" data-panel="saved">
          <div id="lw-saved-list"></div>
        </section>
      </div>
    `;

    const popup = document.createElement("div");
    popup.id = "lw-word-popup";

    const tooltip = document.createElement("div");
    tooltip.id = "lw-hover-tooltip";

    document.body.appendChild(popup);
    document.body.appendChild(tooltip);
    injectSidebar(sidebar);

    state.elements = {
      sidebar,
      popup,
      tooltip,
      subtitleList: sidebar.querySelector("#lw-subtitle-list"),
      wordsPanel: sidebar.querySelector("#lw-words-panel"),
      savedList: sidebar.querySelector("#lw-saved-list")
    };

    sidebar.addEventListener("click", handleSidebarClick);
    popup.addEventListener("click", handlePopupClick);
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("mouseover", handleWordHover);
    document.addEventListener("mouseout", handleWordHoverOut);

    // Load ignored words into state
    chrome.storage.local.get(["ignoredWords"], (result) => {
      (result.ignoredWords || []).forEach((w) => state.ignoredWords.add(w));
    });

    renderSavedTab();
  }

  function injectSidebar(sidebar) {
    if (!isYouTubePage()) {
      // Fixed sidebar on the right edge for generic sites
      sidebar.style.cssText = [
        "position: fixed !important",
        "right: 0 !important",
        "top: 0 !important",
        "width: 360px !important",
        "height: 100vh !important",
        "border-radius: 0 !important",
        "margin-bottom: 0 !important",
        "z-index: 2147483646 !important"
      ].join(";");
      document.body.appendChild(sidebar);
      return;
    }

    sidebar.style.removeProperty("position");
    sidebar.style.removeProperty("top");
    sidebar.style.removeProperty("left");
    sidebar.style.removeProperty("right");
    sidebar.style.removeProperty("bottom");
    sidebar.style.removeProperty("z-index");

    const secondary = document.querySelector("#secondary");
    if (secondary) {
      secondary.insertBefore(sidebar, secondary.firstChild);
      return;
    }

    const observer = new MutationObserver(() => {
      const sec = document.querySelector("#secondary");
      if (sec) {
        observer.disconnect();
        sec.insertBefore(sidebar, sec.firstChild);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function attachOverlay(video) {
    const parent = video.parentElement || document.body;
    const computed = window.getComputedStyle(parent);

    if (computed.position === "static") {
      parent.style.position = "relative";
    }

    if (state.elements.overlay?.parentElement === parent) {
      return;
    }

    state.elements.overlay?.remove();
    const overlay = document.createElement("div");
    overlay.id = "lw-overlay";
    overlay.className = "lw-hidden";
    overlay.innerHTML = `
      <div id="lw-overlay-primary" class="lw-overlay-pill lw-sub-primary"></div>
      <div id="lw-overlay-translation" class="lw-overlay-pill lw-sub-translation"></div>
    `;

    parent.appendChild(overlay);
    overlay.addEventListener("click", handleOverlayClick);

    state.elements.overlay = overlay;
    state.elements.overlayPrimary = overlay.querySelector("#lw-overlay-primary");
    state.elements.overlayTranslation = overlay.querySelector("#lw-overlay-translation");
  }

  function attachLButton() {
    if (document.getElementById("lw-toggle-btn")) {
      return;
    }

    const btn = document.createElement("button");
    btn.id = "lw-toggle-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Toggle LingoWatch");
    btn.setAttribute("data-tooltip", "LingoWatch — open learning panel");
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>`;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSidebar(!state.sidebarOpen);
    });
    btn.addEventListener("mousedown", (e) => e.stopPropagation());

    state.elements.lButton = btn;

    // Poll for YouTube's player controls bar — it loads asynchronously
    let attempts = 0;
    const tryInject = setInterval(() => {
      attempts++;
      const timeDisplay = document.querySelector(".ytp-time-display");
      if (timeDisplay) {
        clearInterval(tryInject);
        timeDisplay.insertAdjacentElement("afterend", btn);
        return;
      }
      const leftControls = document.querySelector(".ytp-left-controls");
      if (leftControls) {
        clearInterval(tryInject);
        leftControls.appendChild(btn);
        return;
      }
      if (attempts >= 75) { // give up after ~15s
        clearInterval(tryInject);
      }
    }, 200);
  }

  function updateLButton() {
    const btn = state.elements.lButton;
    if (!btn) return;
    if (state.sidebarOpen) {
      btn.classList.add("lw-btn-active");
      btn.setAttribute("data-tooltip", "Close LingoWatch");
    } else {
      btn.classList.remove("lw-btn-active");
      btn.setAttribute("data-tooltip", "LingoWatch — open learning panel");
    }
  }

  function injectQuickSaveModal() {
    if (document.getElementById("lw-quick-modal")) {
      return;
    }

    const modal = document.createElement("div");
    modal.id = "lw-quick-modal";
    modal.innerHTML = `
      <div id="lw-quick-modal-inner">
        <div id="lw-quick-modal-header">
          <span id="lw-quick-modal-title">Save a word</span>
          <button type="button" id="lw-quick-modal-close" data-modal-action="close">✕</button>
        </div>
        <div id="lw-quick-modal-body">
          <div class="lw-quick-field">
            <label class="lw-quick-label">English word or phrase</label>
            <input id="lw-quick-word-input" class="lw-quick-input" type="text" placeholder="e.g. sneakers" />
          </div>
          <div class="lw-quick-field">
            <label class="lw-quick-label">
              Somali translation
              <span id="lw-quick-translating" style="display:none;color:#888;font-size:11px;">translating...</span>
            </label>
            <input id="lw-quick-translation-input" class="lw-quick-input" type="text" placeholder="Auto-translated — you can edit this" />
            <div class="lw-quick-hint">Translation is auto-fetched. Edit it if it looks wrong.</div>
          </div>
          <div class="lw-quick-field">
            <label class="lw-quick-label">Note (optional)</label>
            <input id="lw-quick-note-input" class="lw-quick-input" type="text" placeholder="e.g. heard in this movie" />
          </div>
        </div>
        <div id="lw-quick-modal-footer">
          <button type="button" id="lw-quick-pronounce" data-modal-action="pronounce">🔊 Hear it</button>
          <button type="button" id="lw-quick-save-btn" data-modal-action="save">✓ Save word</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close on backdrop click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeQuickSaveModal();
      }
    });

    // Event delegation for buttons
    modal.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-modal-action]");
      if (!btn) {
        return;
      }

      const action = btn.dataset.modalAction;
      if (action === "close") { closeQuickSaveModal(); return; }
      if (action === "pronounce") {
        const word = document.getElementById("lw-quick-word-input").value.trim();
        if (word) { pronounce(word); }
        return;
      }
      if (action === "save") { saveQuickWord(); return; }
    });

    // Debounced auto-translate on word input
    document.getElementById("lw-quick-word-input").addEventListener("input", (e) => {
      clearTimeout(state.wordInputTimer);
      const value = e.target.value.trim();
      const translationInput = document.getElementById("lw-quick-translation-input");
      const spinner = document.getElementById("lw-quick-translating");

      if (!value) {
        translationInput.value = "";
        return;
      }

      spinner.style.display = "inline";
      translationInput.value = "";

      state.wordInputTimer = setTimeout(async () => {
        const translation = await translateToSomali(value, "");
        translationInput.value = translation;
        spinner.style.display = "none";
        translationInput.focus();
        translationInput.select();
      }, 600);
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      const modal = document.getElementById("lw-quick-modal");
      if (!modal || modal.style.display !== "flex") {
        return;
      }

      if (e.key === "Enter") { saveQuickWord(); }
      if (e.key === "Escape") { closeQuickSaveModal(); }
    });
  }

  function openQuickSaveModal() {
    const modal = document.getElementById("lw-quick-modal");
    if (!modal) {
      return;
    }

    modal.style.display = "flex";
    setTimeout(() => {
      document.getElementById("lw-quick-word-input")?.focus();
    }, 100);
  }

  function closeQuickSaveModal() {
    const modal = document.getElementById("lw-quick-modal");
    if (!modal) {
      return;
    }

    modal.style.display = "none";
    document.getElementById("lw-quick-word-input").value = "";
    document.getElementById("lw-quick-translation-input").value = "";
    document.getElementById("lw-quick-note-input").value = "";
    clearTimeout(state.wordInputTimer);
  }

  function saveQuickWord() {
    const wordInput = document.getElementById("lw-quick-word-input");
    const word = wordInput?.value.trim();

    if (!word) {
      wordInput.style.borderColor = "#ef4444";
      wordInput.focus();
      setTimeout(() => { wordInput.style.borderColor = ""; }, 1500);
      return;
    }

    const translation = document.getElementById("lw-quick-translation-input")?.value.trim() || "";
    const note = document.getElementById("lw-quick-note-input")?.value.trim() || "";

    chrome.storage.local.get(["savedWords"], (result) => {
      const saved = result.savedWords || [];
      const existing = saved.findIndex((w) => w.word === word.toLowerCase());

      const entry = {
        word: word.toLowerCase(),
        displayWord: word,
        translation,
        note,
        isManual: true,
        savedAt: new Date().toLocaleDateString(),
        source: window.location.hostname
      };

      if (existing >= 0) {
        saved[existing] = entry;
        showToast(`"${word}" updated ✓`);
      } else {
        saved.unshift(entry);
        showToast(`"${word}" saved ✓`);
      }

      chrome.storage.local.set({ savedWords: saved }, () => {
        renderSavedTab();
      });
      closeQuickSaveModal();
    });
  }

  function handleSidebarClick(event) {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      if (actionButton.dataset.action === "close") {
        toggleSidebar(false);
      }

      if (actionButton.dataset.action === "settings") {
        showToast("Shortcuts: A replay, D next, S auto-pause");
      }
      return;
    }

    const tabButton = event.target.closest(".lw-tab");
    if (tabButton) {
      setActiveTab(tabButton.dataset.tab);
      return;
    }

    const savedAction = event.target.closest("[data-saved-action]");
    if (savedAction) {
      const word = savedAction.dataset.word || "";
      if (savedAction.dataset.savedAction === "speak") {
        pronounce(word);
      }
      if (savedAction.dataset.savedAction === "delete") {
        deleteWord(word);
      }
      return;
    }

    const wordTarget = event.target.closest(".lw-word, .lw-word-chip");
    if (wordTarget) {
      event.preventDefault();
      event.stopPropagation();
      openWordPopupFromTarget(wordTarget);
      return;
    }

    const lineActionBtn = event.target.closest("[data-line-action]");
    if (lineActionBtn) {
      event.stopPropagation();
      const lineEl = lineActionBtn.closest(".lw-line");
      const index = lineEl ? Number(lineEl.dataset.index) : -1;
      const start = lineEl ? Number(lineEl.dataset.start) : 0;

      if (lineActionBtn.dataset.lineAction === "play") {
        jumpToLine(start);
      }

      if (lineActionBtn.dataset.lineAction === "star") {
        if (state.starredLines.has(index)) {
          state.starredLines.delete(index);
          lineActionBtn.classList.remove("starred");
          lineActionBtn.textContent = "☆";
        } else {
          state.starredLines.add(index);
          lineActionBtn.classList.add("starred");
          lineActionBtn.textContent = "★";
        }
      }
      return;
    }

    const line = event.target.closest(".lw-line");
    if (line && state.currentVideo) {
      const subtitle = state.subtitles[Number(line.dataset.index)];
      if (subtitle) {
        state.currentIndex = -1;
        state.currentVideo.currentTime = subtitle.start;
        state.currentVideo.play().catch(() => {});
      }
    }
  }

  function handleOverlayClick(event) {
    const wordTarget = event.target.closest(".lw-word");
    if (!wordTarget) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openWordPopupFromTarget(wordTarget);
  }

  function handlePopupClick(event) {
    const button = event.target.closest("[data-popup-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.popupAction;
    const word = button.dataset.word || "";

    if (action === "close") { closeWordPopup(); return; }
    if (action === "speak") { pronounce(word); return; }
    if (action === "tab") { switchPopupTab(button.dataset.tab); return; }
    if (action === "open-save") { openSaveWithCustomTranslation(word, button.dataset.translation || ""); return; }
    if (action === "save-custom") { saveWithCustom(word); return; }
    if (action === "ignore") { ignoreWord(word); return; }
    if (action === "lookup-synonym") { lookupSynonym(word); return; }
    if (action === "pronounce-sentence") { pronounceSentence(button.dataset.text || ""); return; }
  }

  function handleDocumentClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest("#lw-word-popup") || target.closest(".lw-word") || target.closest(".lw-word-chip")) {
      return;
    }

    closeHoverTooltip();
  }

  function setActiveTab(tab) {
    state.activeTab = tab;
    state.elements.sidebar.querySelectorAll(".lw-tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === tab);
    });
    state.elements.sidebar.querySelectorAll(".lw-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.panel === tab);
    });
  }

  function toggleSidebar(open) {
    ensureInterface();
    state.sidebarOpen = open;
    state.elements.sidebar.classList.toggle("lw-hidden", !open);
    updateLButton();
  }

  function jumpToLine(startTime) {
    const video = state.currentVideo;
    if (!video) {
      return;
    }

    state.currentIndex = -1;
    video.currentTime = startTime;
    video.play().catch(() => {});

    if (state.autoPause) {
      const line = state.subtitles.find((s) => s.start === startTime);
      if (line) {
        const endTime = startTime + line.duration;
        const pauseHandler = () => {
          if (video.currentTime >= endTime) {
            video.pause();
            video.removeEventListener("timeupdate", pauseHandler);
          }
        };
        video.addEventListener("timeupdate", pauseHandler);
      }
    }
  }

  async function loadFrequencyData() {
    try {
      const response = await fetch(chrome.runtime.getURL("data/frequency.json"));
      if (!response.ok) {
        return;
      }

      state.frequencyData = await response.json();
      if (state.subtitles.length) {
        renderSubtitleList();
        renderWordsTab();
      }
    } catch (_error) {
      console.warn("LingoWatch could not load frequency data.");
    }
  }

  async function loadSubtitlesForCurrentPage(forceReload = false) {
    ensureInterface();
    renderSubtitleStatus("Loading subtitles...");

    const youTubeVideoId = getYouTubeVideoId();
    const subtitleKey = youTubeVideoId ? `youtube:${youTubeVideoId}` : `page:${window.location.href}`;

    if (!forceReload && subtitleKey === state.currentSubtitleKey && state.subtitles.length) {
      return;
    }

    state.currentSubtitleKey = subtitleKey;
    state.currentSubtitleUrl = "";
    state.subtitleSource = "";

    if (youTubeVideoId) {
      const loadedFromYoutubeTrack = await fetchYouTubeCaptionTrack();
      if (loadedFromYoutubeTrack) {
        return;
      }

      await fetchYouTubeTranscript(youTubeVideoId);
      return;
    }

    startSubtitleSearch();
  }

  function startSubtitleSearch() {
    renderSubtitleStatus("Looking for subtitles...");
    state.noSubtitleTimer = setTimeout(() => {
      if (!state.subtitles.length) {
        showNoSubtitlesMessage();
      }
    }, 8000);

    if (state.currentVideo) {
      tryTrackElement(state.currentVideo);
    }

    checkAlreadyFoundSubtitles();
    scanPageForSubtitleUrls();
  }

  function checkAlreadyFoundSubtitles() {
    chrome.runtime.sendMessage({ type: "GET_SUBTITLE_URLS" }, (response) => {
      if (chrome.runtime.lastError || !response?.urls?.length) {
        return;
      }
      response.urls.forEach((url) => {
        if (!state.subtitles.length) {
          handleSubtitleUrl(url);
        }
      });
    });
  }

  function tryTrackElement(video) {
    if (state.trackedVideo === video && state.trackObserverCleanup) {
      return;
    }

    state.trackObserverCleanup?.();
    state.trackedVideo = video;

    const cleanupCallbacks = [];

    // Check existing <track> elements
    Array.from(video.querySelectorAll("track")).forEach((track) => {
      const src = track.src || track.getAttribute("src");
      if (src && !state.subtitles.length) {
        const fullUrl = src.startsWith("http") ? src : `${window.location.origin}${src}`;
        handleSubtitleUrl(fullUrl);
      }
    });

    // Watch for dynamically added <track> elements
    const trackObserver = new MutationObserver(() => {
      Array.from(video.querySelectorAll("track")).forEach((track) => {
        const src = track.src || track.getAttribute("src");
        if (src && !state.subtitles.length) {
          const fullUrl = src.startsWith("http") ? src : `${window.location.origin}${src}`;
          handleSubtitleUrl(fullUrl);
        }
      });
    });
    trackObserver.observe(video, { childList: true, attributes: true });
    cleanupCallbacks.push(() => trackObserver.disconnect());

    // Watch TextTracks API
    const textTracks = video.textTracks;
    if (!textTracks) {
      state.trackObserverCleanup = () => {
        cleanupCallbacks.forEach((cleanup) => cleanup());
      };
      return;
    }

    const attachTrack = (track) => {
      if (track.kind !== "subtitles" && track.kind !== "captions") {
        return;
      }

      track.mode = "hidden";
      const onCueChange = () => {
        if (state.subtitles.length || !track.cues?.length) {
          return;
        }

        const entries = Array.from(track.cues).map((cue, i) => ({
          index: i,
          text: cue.text.replace(/<[^>]+>/g, "").replace(/\n/g, " ").trim(),
          start: cue.startTime,
          duration: cue.endTime - cue.startTime,
          end: cue.endTime
        })).filter((e) => e.text);

        if (entries.length) {
          clearTimeout(state.noSubtitleTimer);
          state.subtitleSource = "text-track";
          setSubtitles(entries);
          showToast(`Subtitles loaded ✓ (${entries.length} lines)`);
        }
      };

      track.addEventListener("cuechange", onCueChange);
      cleanupCallbacks.push(() => {
        track.removeEventListener("cuechange", onCueChange);
      });
    };

    Array.from(textTracks).forEach(attachTrack);
    if (typeof textTracks.addEventListener === "function") {
      const onAddTrack = (e) => attachTrack(e.track);
      textTracks.addEventListener("addtrack", onAddTrack);
      cleanupCallbacks.push(() => {
        textTracks.removeEventListener("addtrack", onAddTrack);
      });
    }

    state.trackObserverCleanup = () => {
      cleanupCallbacks.forEach((cleanup) => cleanup());
    };
  }

  function scanPageForSubtitleUrls() {
    const vttPattern = /["'](https?:\/\/[^"']*\.(?:vtt|srt)[^"']*?)["']/gi;

    document.querySelectorAll("script").forEach((script) => {
      const matches = [...(script.textContent?.matchAll(vttPattern) || [])];
      matches.forEach((match) => {
        if (!state.subtitles.length) {
          handleSubtitleUrl(match[1]);
        }
      });
    });

    const html = document.documentElement?.innerHTML || "";
    const pageMatches = [...html.matchAll(vttPattern)];
    pageMatches.slice(0, 10).forEach((match) => {
      if (!state.subtitles.length) {
        handleSubtitleUrl(match[1]);
      }
    });
  }

  function showNoSubtitlesMessage() {
    ensureInterface();
    updateLButton();
    state.elements.subtitleList.innerHTML = `
      <div style="padding:24px 16px;text-align:center;color:#666;">
        <div style="font-size:32px;margin-bottom:12px;">🔍</div>
        <div style="color:#aaa;margin-bottom:8px;font-size:14px;">No subtitles detected</div>
        <div style="color:#555;font-size:12px;line-height:1.6;">
          Make sure the video has subtitles turned on.<br>
          Tap the <strong style="color:#7C3AED">+</strong> button on the video to save words manually.
        </div>
      </div>
    `;
  }

  function isYouTubePage() {
    return YOUTUBE_HOST_PATTERN.test(window.location.hostname);
  }

  function getYouTubeVideoId() {
    const url = new URL(window.location.href);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "") || null;
    }

    if (!url.hostname.includes("youtube.com")) {
      return null;
    }

    return url.searchParams.get("v");
  }

  function getTrackSubtitleUrl() {
    if (!state.currentVideo) {
      return "";
    }

    const tracks = Array.from(state.currentVideo.querySelectorAll("track[kind='subtitles'], track[kind='captions'], track"));
    const track = tracks.find((item) => item.src);
    return track?.src || "";
  }

  function getYouTubeCaptionTracks() {
    const sources = [];
    if (window.ytInitialPlayerResponse) {
      sources.push(window.ytInitialPlayerResponse);
    }

    if (window.ytplayer?.config?.args?.player_response) {
      try {
        sources.push(JSON.parse(window.ytplayer.config.args.player_response));
      } catch (_error) {
        // Ignore malformed legacy player response.
      }
    }

    for (const source of sources) {
      const tracks = source?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length) {
        return tracks;
      }
    }

    return [];
  }

  async function fetchYouTubeCaptionTrack() {
    const tracks = getYouTubeCaptionTracks();
    if (!tracks.length) {
      return false;
    }

    const preferredTrack = chooseEnglishTrack(tracks) || tracks[0];
    if (!preferredTrack?.baseUrl) {
      return false;
    }

    try {
      const response = await fetch(preferredTrack.baseUrl);
      const rawText = await response.text();
      const subtitles = parseYouTubeCaptionPayload(rawText);
      if (!subtitles.length) {
        return false;
      }

      state.subtitleSource = "youtube-track";
      setSubtitles(subtitles);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function chooseEnglishTrack(tracks) {
    return tracks.find((track) => /^en([_-]|$)/i.test(track.languageCode || ""))
      || tracks.find((track) => /\.en/i.test(track.vssId || ""))
      || tracks.find((track) => /english/i.test(track.name?.simpleText || ""));
  }

  function parseYouTubeCaptionPayload(rawText) {
    const text = rawText.trim();
    if (!text) {
      return [];
    }

    if (text.startsWith("{")) {
      return parseYouTubeJsonCaptions(text);
    }

    return parseYouTubeXmlCaptions(text);
  }

  function parseYouTubeJsonCaptions(text) {
    try {
      const payload = JSON.parse(text);
      const events = Array.isArray(payload.events) ? payload.events : [];
      const subtitles = events.map((event, index) => {
        const segments = Array.isArray(event.segs) ? event.segs : [];
        const line = segments.map((segment) => segment.utf8 || "").join("").replace(/\n+/g, " ").trim();
        if (!line) {
          return null;
        }

        const start = (Number(event.tStartMs) || 0) / 1000;
        const duration = (Number(event.dDurationMs) || 0) / 1000;
        return { index, text: line, start, duration };
      }).filter(Boolean);

      return normalizeSubtitles(subtitles);
    } catch (_error) {
      return [];
    }
  }

  function parseYouTubeXmlCaptions(text) {
    try {
      const xml = new DOMParser().parseFromString(text, "text/xml");
      const nodes = Array.from(xml.getElementsByTagName("text"));
      const subtitles = nodes.map((node, index) => {
        const start = Number(node.getAttribute("start")) || 0;
        const duration = Number(node.getAttribute("dur")) || 0;
        const line = decodeHtmlEntities(node.textContent || "").replace(/\s+/g, " ").trim();
        if (!line) {
          return null;
        }

        return { index, text: line, start, duration };
      }).filter(Boolean);

      return normalizeSubtitles(subtitles);
    } catch (_error) {
      return [];
    }
  }

  async function fetchYouTubeTranscript(videoId) {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/transcript/${encodeURIComponent(videoId)}?lang=en`);
      const data = await response.json().catch(() => ({}));
      const backendMessage = typeof data.detail === "string" ? data.detail : "";

      if (!response.ok || !Array.isArray(data.transcript)) {
        setSubtitles([]);
        renderSubtitleStatus(backendMessage || "Could not load YouTube subtitles. Start the FastAPI backend at http://localhost:8000 and try again.");
        return;
      }

      const raw = data.transcript.map((entry, index) => {
        const start = Number(entry.start) || 0;
        const duration = Number(entry.duration) || 0;
        return { index, text: String(entry.text || "").replace(/\n/g, " ").trim(), start, duration };
      }).filter((entry) => entry.text);

      // Compute end times without merging lines
      const entries = raw.map((s, i) => ({
        ...s,
        end: raw[i + 1] ? raw[i + 1].start : s.start + Math.max(s.duration, 0.25)
      }));

      clearTimeout(state.noSubtitleTimer);
      state.subtitleSource = "backend";
      state.subtitles = entries;
      state.currentIndex = -1;
      updateLButton();
      renderSubtitleList();
      renderWordsTab();
      renderSavedTab();
      syncCurrentSubtitle();
    } catch (_error) {
      setSubtitles([]);
      renderSubtitleStatus("Could not reach the local transcript backend. Run `uvicorn main:app --host 0.0.0.0 --port 8000` inside backend/.");
    }
  }

  async function handleSubtitleUrl(url) {
    if (!url || url === state.currentSubtitleUrl) {
      return;
    }

    state.currentSubtitleUrl = url;
    renderSubtitleStatus("Loading captured subtitle file...");

    try {
      const response = await fetch(url);
      const text = await response.text();
      const parsed = /\.srt(\?|$)/i.test(url) ? parseSRT(text) : parseVTT(text);
      state.subtitleSource = "captured-track";
      setSubtitles(parsed);
    } catch (_error) {
      renderSubtitleStatus("LingoWatch found a subtitle file but could not read it.");
    }
  }

  function parseVTT(text) {
    const subtitles = text
      .replace(/\r/g, "")
      .split(/\n\n+/)
      .map((block, index) => {
        const lines = block.trim().split("\n").filter(Boolean);
        if (!lines.length || lines[0] === "WEBVTT") {
          return null;
        }

        const timingLine = lines.find((line) => line.includes("-->"));
        if (!timingLine) {
          return null;
        }

        const [startText, endText] = timingLine.split("-->").map((part) => part.trim().split(" ")[0]);
        if (!startText || !endText) {
          return null;
        }

        const timeLineIndex = lines.indexOf(timingLine);
        const subtitleText = lines.slice(timeLineIndex + 1).join(" ").replace(/<[^>]+>/g, "").trim();
        if (!subtitleText) {
          return null;
        }

        return {
          index,
          start: toSeconds(startText),
          duration: Math.max(toSeconds(endText) - toSeconds(startText), 0),
          text: subtitleText
        };
      })
      .filter(Boolean);

    return normalizeSubtitles(subtitles);
  }

  function parseSRT(text) {
    const subtitles = text
      .replace(/\r/g, "")
      .split(/\n\n+/)
      .map((block, index) => {
        const lines = block.trim().split("\n").filter(Boolean);
        if (lines.length < 2) {
          return null;
        }

        const timingLine = lines.find((line) => line.includes("-->"));
        if (!timingLine) {
          return null;
        }

        const [startText, endText] = timingLine.split("-->").map((part) => part.trim().split(" ")[0].replace(",", "."));
        if (!startText || !endText) {
          return null;
        }

        const timeLineIndex = lines.indexOf(timingLine);
        const subtitleText = lines.slice(timeLineIndex + 1).join(" ").replace(/<[^>]+>/g, "").trim();
        if (!subtitleText) {
          return null;
        }

        return {
          index,
          start: toSeconds(startText),
          duration: Math.max(toSeconds(endText) - toSeconds(startText), 0),
          text: subtitleText
        };
      })
      .filter(Boolean);

    return normalizeSubtitles(subtitles);
  }

  function normalizeSubtitles(subtitles) {
    const cleaned = subtitles
      .map((subtitle) => ({
        text: String(subtitle.text || "").replace(/\s+/g, " ").trim(),
        start: Number(subtitle.start) || 0,
        duration: Math.max(Number(subtitle.duration) || 0, 0)
      }))
      .filter((subtitle) => subtitle.text)
      .sort((left, right) => left.start - right.start);

    const normalized = cleaned.map((subtitle, index) => {
      const next = cleaned[index + 1];
      const naturalEnd = subtitle.start + Math.max(subtitle.duration, 0.25);
      const end = next && next.start > subtitle.start
        ? Math.min(naturalEnd, next.start)
        : naturalEnd;

      return {
        index,
        text: subtitle.text,
        start: subtitle.start,
        duration: Math.max(end - subtitle.start, 0.25),
        end: Math.max(end, subtitle.start + 0.25)
      };
    });

    return mergeSubtitleChunks(normalized);
  }

  function mergeSubtitleChunks(subtitles) {
    if (!subtitles.length) {
      return [];
    }

    const merged = [];
    let buffer = null;

    subtitles.forEach((subtitle) => {
      if (!buffer) {
        buffer = { ...subtitle };
        return;
      }

      if (shouldMergeSubtitles(buffer, subtitle)) {
        buffer.text = `${buffer.text} ${subtitle.text}`.replace(/\s+/g, " ").trim();
        buffer.duration = subtitle.end - buffer.start;
        buffer.end = subtitle.end;
        return;
      }

      merged.push(buffer);
      buffer = { ...subtitle };
    });

    if (buffer) {
      merged.push(buffer);
    }

    return merged.map((subtitle, index) => ({
      ...subtitle,
      index
    }));
  }

  function shouldMergeSubtitles(current, next) {
    const gap = next.start - current.end;
    const combinedLength = `${current.text} ${next.text}`.length;
    const currentEndsSentence = /[.!?]["']?$/.test(current.text);
    const nextStartsNewSentence = /^[A-Z"'([]/.test(next.text) && current.text.length > 35;
    const currentLooksIncomplete = !currentEndsSentence || /[,;:]$/.test(current.text);
    const nextLooksContinuation = /^[a-z0-9"'([]/.test(next.text) || next.text.length < 28;

    if (gap > 0.2) {
      return false;
    }

    if (combinedLength > 95) {
      return false;
    }

    if (currentEndsSentence && nextStartsNewSentence) {
      return false;
    }

    return currentLooksIncomplete || nextLooksContinuation;
  }

  function toSeconds(timeText) {
    const parts = timeText.split(":").map((part) => Number(part));
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return parts[0] || 0;
  }

  function setSubtitles(nextSubtitles) {
    clearTimeout(state.noSubtitleTimer);
    state.subtitles = normalizeSubtitles(nextSubtitles);
    updateLButton();
    state.currentIndex = -1;
    renderSubtitleList();
    renderWordsTab();
    renderSavedTab();
    syncCurrentSubtitle();
  }

  function renderSubtitleStatus(message) {
    ensureInterface();
    state.elements.subtitleList.innerHTML = `<p class="lw-empty">${escapeHtml(message)}</p>`;
  }

  function renderSubtitleList() {
    ensureInterface();

    if (!state.subtitles.length) {
      renderSubtitleStatus("No subtitles loaded yet.");
      updateOverlay(null);
      return;
    }

    const playSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM10.6219 8.41459C10.5562 8.37078 10.479 8.34741 10.4 8.34741C10.1791 8.34741 10 8.52649 10 8.74741V15.2526C10 15.3316 10.0234 15.4088 10.0672 15.4745C10.1897 15.6583 10.4381 15.708 10.6219 15.5854L15.5008 12.3328C15.5447 12.3035 15.5824 12.2658 15.6117 12.2219C15.7343 12.0381 15.6846 11.7897 15.5008 11.6672L10.6219 8.41459Z"></path></svg>`;

    state.elements.subtitleList.innerHTML = state.subtitles.map((subtitle) => {
      const starred = state.starredLines.has(subtitle.index);
      return `
        <div class="lw-line" data-index="${subtitle.index}" data-start="${subtitle.start}">
          <button type="button" class="lw-play-btn" data-line-action="play" title="Replay this line">${playSVG}</button>
          <span class="lw-timestamp" data-line-action="play" title="Jump to this line">${formatTime(subtitle.start)}</span>
          <div class="lw-line-content">${wrapWordsInLine(subtitle.text)}</div>
          <button type="button" class="lw-star-btn${starred ? " starred" : ""}" data-line-action="star">${starred ? "★" : "☆"}</button>
        </div>
      `;
    }).join("");

    highlightSidebarLine(state.currentIndex);
  }

  function renderWordsTab() {
    ensureInterface();

    if (!state.subtitles.length) {
      state.elements.wordsPanel.innerHTML = '<p class="lw-empty">Load subtitles to see the vocabulary grouped by frequency.</p>';
      return;
    }

    const uniqueWords = new Set();
    state.subtitles.forEach((subtitle) => {
      subtitle.text.split(/\s+/).forEach((rawWord) => {
        const clean = cleanWord(rawWord).toLowerCase();
        if (clean.length > 2) {
          uniqueWords.add(clean);
        }
      });
    });

    const groups = {
      "Rank 1-1000": [],
      "Rank 1001-3000": [],
      "Rank 3001-5000": [],
      "Rank 5001-8000": [],
      "Rank 8001+": []
    };

    Array.from(uniqueWords)
      .sort((left, right) => getRank(left) - getRank(right) || left.localeCompare(right))
      .forEach((word) => {
        const rank = getRank(word);
        if (rank <= 1000) {
          groups["Rank 1-1000"].push(word);
        } else if (rank <= 3000) {
          groups["Rank 1001-3000"].push(word);
        } else if (rank <= 5000) {
          groups["Rank 3001-5000"].push(word);
        } else if (rank <= 8000) {
          groups["Rank 5001-8000"].push(word);
        } else {
          groups["Rank 8001+"].push(word);
        }
      });

    state.elements.wordsPanel.innerHTML = groupLabels.map((label) => `
      <div class="lw-rank-group">
        <div class="lw-rank-label">${escapeHtml(label)}</div>
        <div class="lw-rank-words">
          ${groups[label].length
            ? groups[label].map((word) => `<span class="lw-word-chip ${getWordClass(word)}" data-word="${escapeAttribute(word)}">${escapeHtml(word)}</span>`).join("")
            : '<span class="lw-empty">No words in this range yet.</span>'}
        </div>
      </div>
    `).join("");
  }

  async function renderSavedTab() {
    if (!state.elements.savedList) {
      return;
    }

    const savedWords = await getSavedWords();
    if (!savedWords.length) {
      state.elements.savedList.innerHTML = '<p class="lw-empty">No saved words yet. Click any word to save it.</p>';
      return;
    }

    state.elements.savedList.innerHTML = savedWords.map((entry) => `
      <div class="lw-saved-item">
        <div class="lw-saved-left">
          <div class="lw-saved-top-row">
            <span class="lw-saved-word">${escapeHtml(entry.displayWord || entry.word)}</span>
            ${entry.isManual ? '<span class="lw-manual-badge">manual</span>' : ""}
            ${entry.isCustomTranslation ? '<span class="lw-custom-badge">custom</span>' : ""}
          </div>
          <span class="lw-saved-translation">
            ${entry.translation ? `🇸🇴 ${escapeHtml(entry.translation)}` : '<em style="color:#555">no translation</em>'}
          </span>
          ${entry.note ? `<span class="lw-saved-note">📝 ${escapeHtml(entry.note)}</span>` : ""}
          ${entry.synonyms?.length ? `
            <div class="lw-saved-synonyms">
              ${entry.synonyms.slice(0, 4).map((s) => `<span class="lw-saved-syn-chip">${escapeHtml(s)}</span>`).join("")}
            </div>
          ` : ""}
          <span class="lw-saved-date">
            ${escapeHtml(entry.savedAt)}${entry.source ? ` · ${escapeHtml(entry.source)}` : ""}
          </span>
        </div>
        <div class="lw-saved-actions">
          <button type="button" data-saved-action="speak" data-word="${escapeAttribute(entry.word)}">🔊</button>
          <button type="button" data-saved-action="delete" data-word="${escapeAttribute(entry.word)}">🗑</button>
        </div>
      </div>
    `).join("");
  }

  function syncCurrentSubtitle() {
    const video = state.currentVideo;
    if (!video || !state.subtitles.length) {
      return;
    }

    const nextIndex = findSubtitleIndexAtTime(video.currentTime);

    if (nextIndex === -1) {
      if (state.currentIndex !== -1) {
        state.currentIndex = -1;
        highlightSidebarLine(-1);
        updateOverlay(null);
      }
      return;
    }

    if (nextIndex === state.currentIndex) {
      return;
    }

    state.currentIndex = nextIndex;
    const currentSubtitle = state.subtitles[nextIndex];
    highlightSidebarLine(nextIndex);
    scrollSidebarToLine(nextIndex);
    updateOverlay(currentSubtitle.text);

    if (state.autoPause) {
      video.pause();
    }
  }

  function findSubtitleIndexAtTime(time) {
    let low = 0;
    let high = state.subtitles.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const subtitle = state.subtitles[mid];
      if (time < subtitle.start) {
        high = mid - 1;
      } else if (time >= subtitle.end) {
        low = mid + 1;
      } else {
        return mid;
      }
    }

    return -1;
  }

  function highlightSidebarLine(index) {
    if (!state.elements.subtitleList) {
      return;
    }

    state.elements.subtitleList.querySelectorAll(".lw-line").forEach((line) => {
      line.classList.toggle("active", Number(line.dataset.index) === index);
    });
  }

  function scrollSidebarToLine(index) {
    const activeLine = state.elements.subtitleList.querySelector(`.lw-line[data-index="${index}"]`);
    if (!activeLine) {
      return;
    }

    const parentRect = state.elements.subtitleList.getBoundingClientRect();
    const lineRect = activeLine.getBoundingClientRect();
    const outsideVisibleRange = lineRect.top < parentRect.top + 60 || lineRect.bottom > parentRect.bottom - 60;
    if (outsideVisibleRange) {
      activeLine.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  async function updateOverlay(text) {
    const overlay = state.elements.overlay;
    if (!overlay || !state.elements.overlayPrimary || !state.elements.overlayTranslation) {
      return;
    }

    if (!text) {
      overlay.classList.add("lw-hidden");
      state.elements.overlayPrimary.innerHTML = "";
      state.elements.overlayTranslation.textContent = "";
      return;
    }

    const translationOnly = isYouTubePage() && hasVisibleYouTubeCaptions();
    overlay.classList.remove("lw-hidden");
    overlay.classList.toggle("lw-translation-only", translationOnly);

    if (translationOnly) {
      state.elements.overlayPrimary.innerHTML = "";
      state.elements.overlayPrimary.style.display = "none";
    } else {
      state.elements.overlayPrimary.style.display = "inline-flex";
      state.elements.overlayPrimary.innerHTML = wrapWordsInLine(text);
    }

    state.elements.overlayTranslation.textContent = "Translating...";

    const requestId = ++state.overlayRequestId;
    const translation = await translateToSomali(text, "");
    if (requestId !== state.overlayRequestId) {
      return;
    }

    state.elements.overlayTranslation.textContent = translation;
  }

  function hasVisibleYouTubeCaptions() {
    const container = document.querySelector(".ytp-caption-window-container");
    if (!container) {
      return false;
    }

    const text = container.textContent?.trim();
    return Boolean(text);
  }

  function wrapWordsInLine(text) {
    return text.split(/(\s+)/).map((part) => {
      if (!part.trim()) {
        return part;
      }

      const clean = cleanWord(part);
      if (!clean) {
        return escapeHtml(part);
      }

      return `<span class="${getWordClass(clean)}" data-word="${escapeAttribute(clean.toLowerCase())}">${escapeHtml(part)}</span>`;
    }).join("");
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function cleanWord(word) {
    return word.replace(/[^a-zA-Z]/g, "");
  }

  function getRank(word) {
    return state.frequencyData[word.toLowerCase()] || 9999;
  }

  function getWordClass(word) {
    if (state.ignoredWords.has(word.toLowerCase())) {
      return "lw-word";
    }

    const rank = getRank(word);
    if (rank > 6000) {
      return "lw-word lw-rare-high";
    }
    if (rank > 3000) {
      return "lw-word lw-rare-mid";
    }
    return "lw-word";
  }

  function openWordPopupFromTarget(target) {
    const word = (target.dataset.word || target.textContent || "").trim().toLowerCase();
    if (!word) {
      return;
    }

    closeHoverTooltip();
    showWordPopup(word, target.getBoundingClientRect());
  }

  function positionPopup(popup, rect) {
    const sidebarRect = state.elements.sidebar?.getBoundingClientRect();
    const sidebarLeft = sidebarRect ? sidebarRect.left : window.innerWidth;
    const popupWidth = popup.offsetWidth || 380;
    const popupHeight = popup.offsetHeight || 420;
    const maxLeft = sidebarLeft - popupWidth - 16;
    let left = Math.min(rect.left, maxLeft);
    left = Math.max(left, 8);
    const gutter = 12;
    const minTop = 16;
    const maxTop = Math.max(window.innerHeight - popupHeight - 16, minTop);
    const spaceAbove = rect.top - gutter;
    const spaceBelow = window.innerHeight - rect.bottom - gutter;

    let top;
    if (spaceAbove >= popupHeight || spaceAbove > spaceBelow) {
      top = rect.top - popupHeight - gutter;
    } else {
      top = rect.bottom + gutter;
    }

    top = Math.max(minTop, Math.min(top, maxTop));

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  async function showWordPopup(word, rect) {
    ensureInterface();
    const popup = state.elements.popup;
    const requestId = ++state.popupRequestId;
    const currentLine = state.subtitles[state.currentIndex]?.text || "";

    const skeletonHtml = `
      <div class="lw-loading">
        <div class="lw-skeleton"></div>
        <div class="lw-skeleton short"></div>
        <div class="lw-skeleton"></div>
      </div>`;

    popup.innerHTML = `
      <div class="lw-popup-header">
        <div class="lw-popup-header-left">
          <div class="lw-popup-word">${escapeHtml(word)}</div>
          <div class="lw-popup-phonetic" id="lw-popup-phonetic-el"></div>
          <div class="lw-popup-translation-main" id="lw-popup-translation-el">...</div>
        </div>
        <div class="lw-popup-header-right">
          <button type="button" class="lw-popup-speak" data-popup-action="speak" data-word="${escapeAttribute(word)}">🔊</button>
          <button type="button" class="lw-popup-close" data-popup-action="close">✕</button>
        </div>
      </div>
      <div class="lw-popup-tabs">
        <button type="button" class="lw-popup-tab active" data-popup-action="tab" data-tab="explain">Explain</button>
        <button type="button" class="lw-popup-tab" data-popup-action="tab" data-tab="examples">Examples</button>
        <button type="button" class="lw-popup-tab" data-popup-action="tab" data-tab="grammar">Grammar</button>
      </div>
      <div class="lw-popup-body">
        <div class="lw-popup-panel" id="lw-panel-explain">${skeletonHtml}</div>
        <div class="lw-popup-panel" id="lw-panel-examples" style="display:none">${skeletonHtml}</div>
        <div class="lw-popup-panel" id="lw-panel-grammar" style="display:none">${skeletonHtml}</div>
      </div>
      <div class="lw-popup-links">
        <a href="https://reverso.net/translation/english-somali/${encodeURIComponent(word)}" target="_blank" class="lw-popup-link">Re</a>
        <a href="https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(word)}" target="_blank" class="lw-popup-link">Ca</a>
        <a href="https://translate.google.com/?sl=en&tl=so&text=${encodeURIComponent(word)}" target="_blank" class="lw-popup-link">Gl</a>
      </div>
      <div class="lw-popup-actions">
        <button type="button" class="lw-action-save" id="lw-popup-save-btn" data-popup-action="open-save" data-word="${escapeAttribute(word)}" data-translation="">✓ Save</button>
        <button type="button" class="lw-action-ignore" data-popup-action="ignore" data-word="${escapeAttribute(word)}">🚫</button>
        <div class="lw-action-custom-translation" id="lw-custom-translation-area" style="display:none">
          <input id="lw-custom-input" placeholder="Add your own Somali translation..." />
          <button type="button" data-popup-action="save-custom" data-word="${escapeAttribute(word)}">Save</button>
        </div>
      </div>
    `;

    popup.style.display = "flex";
    positionPopup(popup, rect);

    // Phase 1: fetch all word data (AI + dict + Datamuse in parallel)
    const { aiData, dictEntries, synonyms, antonyms } = await getFullWordData(word, currentLine);
    if (requestId !== state.popupRequestId) return;

    state.lastPopupAiData = aiData;
    state.lastPopupSynonyms = synonyms;
    state.lastPopupAntonyms = antonyms;

    const meanings = dictEntries[0]?.meanings || [];
    const phonetic = dictEntries[0]?.phonetic || "";
    const translation = aiData?.somalTranslation || await translateToSomali(word, "");
    if (requestId !== state.popupRequestId) return;

    // Update header
    popup.querySelector("#lw-popup-phonetic-el").textContent = phonetic;
    popup.querySelector("#lw-popup-translation-el").textContent = translation;
    const saveBtn = popup.querySelector("#lw-popup-save-btn");
    if (saveBtn) saveBtn.dataset.translation = translation;

    // Helpers
    const audioSvg = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.259 0-1.994.988-1.252 2.02C4.484 11.059 5 12.5 5 14.5c0 2.001-.516 3.441-1.252 4.979C2.514 20.488 3.249 21 4.508 21H6.44l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06z"/></svg>`;
    function audioBtn(text, small = false) {
      return `<button type="button" class="lw-example-audio-btn${small ? " small" : ""}" data-popup-action="pronounce-sentence" data-text="${escapeAttribute(text)}" title="Listen">${audioSvg(small ? 12 : 14)}</button>`;
    }
    function chips(list, cls = "", clickable = true) {
      return list.map((s) => {
        const action = clickable ? ` data-popup-action="lookup-synonym" data-word="${escapeAttribute(s)}"` : "";
        return `<span class="lw-synonym-chip${cls ? " " + cls : ""}"${action}>${escapeHtml(s)}</span>`;
      }).join("");
    }

    // Render Explain tab
    const explainPanel = popup.querySelector("#lw-panel-explain");
    if (explainPanel) {
      explainPanel.innerHTML = `
        ${aiData?.contextExplanation ? `
          <div class="lw-explain-context-box">
            <div class="lw-explain-context-label">In this context</div>
            <div class="lw-explain-context-text">${escapeHtml(aiData.contextExplanation)}</div>
          </div>
        ` : ""}
        <div class="lw-popup-word-orange">${escapeHtml(word)}</div>
        ${meanings.slice(0, 2).map((m) => `
          <div class="lw-popup-pos">(${escapeHtml(m.partOfSpeech)})</div>
          ${m.definitions.slice(0, 2).map((d) => `<div class="lw-popup-def-row">${escapeHtml(d.definition)}</div>`).join("")}
        `).join("")}
        ${synonyms.length ? `
          <div class="lw-popup-divider"></div>
          <div class="lw-section-label">Synonyms (${synonyms.length})</div>
          <div class="lw-chips-wrap">${chips(synonyms)}</div>
        ` : ""}
        ${aiData?.synonymsSomali?.length ? `
          <div class="lw-section-label" style="margin-top:10px">Synonyms in Somali</div>
          <div class="lw-chips-wrap">${chips(aiData.synonymsSomali, "somali", false)}</div>
        ` : ""}
        ${antonyms.length ? `
          <div class="lw-popup-divider"></div>
          <div class="lw-section-label">Antonyms (${antonyms.length})</div>
          <div class="lw-chips-wrap">${chips(antonyms, "antonym")}</div>
        ` : ""}
        ${aiData?.alternatives?.length ? `
          <div class="lw-popup-divider"></div>
          <div class="lw-alts-label">Somali alternatives</div>
          <div class="lw-alts-row">${aiData.alternatives.map((a) => `<span class="lw-alt-chip">${escapeHtml(a)}</span>`).join("")}</div>
        ` : ""}
        ${currentLine ? `
          <div class="lw-popup-divider"></div>
          <div class="lw-section-label">Examples: Current text</div>
          <div class="lw-example-card current">
            <div class="lw-example-content"><div class="lw-example-text">${highlightWordInText(escapeHtml(currentLine), word)}</div></div>
            ${audioBtn(currentLine)}
          </div>
        ` : ""}
        ${aiData?.exampleSentence ? `
          <div class="lw-section-label" style="margin-top:6px">Another example</div>
          <div class="lw-example-card">
            <div class="lw-example-content"><div class="lw-example-text">${highlightWordInText(escapeHtml(aiData.exampleSentence), word)}</div></div>
            ${audioBtn(aiData.exampleSentence)}
          </div>
        ` : ""}
      `;
    }

    // Render Grammar tab
    const grammarPanel = popup.querySelector("#lw-panel-grammar");
    if (grammarPanel) {
      grammarPanel.innerHTML = meanings.map((m) => `
        <div class="lw-grammar-pos-header">${escapeHtml(m.partOfSpeech)}</div>
        ${m.definitions.slice(0, 4).map((d) => `
          <div class="lw-grammar-def-block">
            <div class="lw-grammar-def-text">${escapeHtml(d.definition)}</div>
            ${d.example ? `
              <div class="lw-grammar-def-example">
                <span>"${escapeHtml(d.example)}"</span>
                ${audioBtn(d.example, true)}
              </div>
            ` : ""}
          </div>
        `).join("")}
        ${m.synonyms?.length ? `
          <div class="lw-section-label">Synonyms</div>
          <div class="lw-chips-wrap">${chips(m.synonyms.slice(0, 10))}</div>
        ` : ""}
        ${m.antonyms?.length ? `
          <div class="lw-section-label">Antonyms</div>
          <div class="lw-chips-wrap">${chips(m.antonyms.slice(0, 10), "antonym")}</div>
        ` : ""}
      `).join('<div class="lw-popup-divider"></div>') || `<div class="lw-popup-empty">No grammar data found</div>`;
    }

    positionPopup(popup, rect);

    // Phase 2: fetch examples (makes a second AI call — loads after explain/grammar)
    const examples = await getAllExamples(word, dictEntries, currentLine);
    if (requestId !== state.popupRequestId) return;

    const examplesPanel = popup.querySelector("#lw-panel-examples");
    if (examplesPanel) {
      examplesPanel.innerHTML = examples.length ? `
        <div class="lw-examples-count">${examples.length} examples</div>
        ${examples.map((ex, i) => `
          <div class="lw-example-card ${ex.isCurrent ? "current" : ""}">
            <div class="lw-example-number">${i + 1}</div>
            <div class="lw-example-content">
              <div class="lw-example-text">${highlightWordInText(escapeHtml(ex.text), word)}</div>
              ${ex.isCurrent ? `<div class="lw-example-badge">current video</div>` : ""}
              ${ex.source === "ai" ? `<div class="lw-example-badge ai">AI generated</div>` : ""}
            </div>
            ${audioBtn(ex.text)}
          </div>
        `).join("")}
      ` : `<div class="lw-popup-empty">No examples found for "${escapeHtml(word)}"</div>`;
    }
  }

  function closeWordPopup() {
    if (state.elements.popup) {
      state.elements.popup.style.display = "none";
      state.popupRequestId++;
    }
  }

  function lookupSynonym(word) {
    closeWordPopup();
    setTimeout(() => {
      const rect = {
        left: window.innerWidth / 2 - 190,
        top: window.innerHeight / 2 - 220,
        right: window.innerWidth / 2 + 190,
        bottom: window.innerHeight / 2 - 200,
      };
      showWordPopup(word, rect);
    }, 150);
  }

  function closePopup() {
    closeWordPopup();
  }

  function switchPopupTab(tab) {
    const popup = state.elements.popup;
    if (!popup) {
      return;
    }

    popup.querySelectorAll(".lw-popup-panel").forEach((p) => { p.style.display = "none"; });
    popup.querySelectorAll(".lw-popup-tab").forEach((b) => b.classList.remove("active"));
    const panel = popup.querySelector(`#lw-panel-${tab}`);
    if (panel) {
      panel.style.display = "block";
    }

    const tabBtn = popup.querySelector(`.lw-popup-tab[data-tab="${tab}"]`);
    if (tabBtn) {
      tabBtn.classList.add("active");
    }
  }

  function handleWordHover(event) {
    const wordEl = event.target.closest(".lw-word");
    if (!wordEl) {
      return;
    }

    clearTimeout(state.hoverTimer);
    state.hoverTimer = setTimeout(() => showHoverTooltip(wordEl), 400);
  }

  function handleWordHoverOut(event) {
    const wordEl = event.target.closest(".lw-word");
    if (!wordEl) {
      return;
    }

    clearTimeout(state.hoverTimer);
    setTimeout(() => {
      const tooltip = state.elements.tooltip;
      if (tooltip && !tooltip.matches(":hover")) {
        closeHoverTooltip();
      }
    }, 300);
  }

  async function showHoverTooltip(wordEl) {
    const word = (wordEl.dataset.word || wordEl.textContent || "").trim().toLowerCase();
    if (!word) {
      return;
    }

    const tooltip = state.elements.tooltip;
    if (!tooltip) {
      return;
    }

    const rect = wordEl.getBoundingClientRect();
    const sidebarRect = state.elements.sidebar?.getBoundingClientRect();
    const sidebarLeft = sidebarRect ? sidebarRect.left : window.innerWidth;
    const tooltipWidth = 260;
    const maxLeft = sidebarLeft - tooltipWidth - 16;
    const left = Math.max(Math.min(rect.left, maxLeft), 8);
    tooltip.style.display = "block";
    tooltip.style.top = `${Math.max(Math.min(rect.bottom + 8, window.innerHeight - 16), 8)}px`;
    tooltip.style.left = `${left}px`;
    tooltip.innerHTML = `<div class="lw-ht-header"><span class="lw-ht-word">${escapeHtml(word)}</span><span class="lw-ht-colon"> : </span><span class="lw-ht-translation">...</span></div>`;

    const [wordTranslation, lineTranslation] = await Promise.all([
      translateToSomali(word, ""),
      (state.subtitles[state.currentIndex]?.text
        ? translateToSomali(state.subtitles[state.currentIndex].text, "")
        : Promise.resolve(""))
    ]);

    if (tooltip.style.display === "none") {
      return;
    }

    tooltip.innerHTML = `
      <div class="lw-ht-header">
        <span class="lw-ht-toggle"></span>
        <span class="lw-ht-word">${escapeHtml(word)}</span>
        <span class="lw-ht-colon"> : </span>
        <span class="lw-ht-translation">${escapeHtml(wordTranslation)}</span>
      </div>
      ${lineTranslation ? `<div class="lw-ht-divider"></div><div class="lw-ht-sentence">${escapeHtml(lineTranslation)}</div>` : ""}
    `;
  }

  function closeHoverTooltip() {
    if (state.elements.tooltip) {
      state.elements.tooltip.style.display = "none";
    }
  }

  function ignoreWord(word) {
    const normalizedWord = word.toLowerCase();
    state.ignoredWords.add(normalizedWord);
    chrome.storage.local.get(["ignoredWords"], (result) => {
      const ignored = result.ignoredWords || [];
      if (!ignored.includes(normalizedWord)) {
        ignored.push(normalizedWord);
        chrome.storage.local.set({ ignoredWords: ignored });
      }
    });

    closeWordPopup();
    renderSubtitleList();
    renderWordsTab();
    showToast(`"${word}" ignored`);
  }

  function openSaveWithCustomTranslation(word, autoTranslation) {
    const area = document.getElementById("lw-custom-translation-area");
    const input = document.getElementById("lw-custom-input");
    if (!area || !input) {
      return;
    }

    area.style.display = "flex";
    input.value = autoTranslation;
    input.focus();
    input.select();
  }

  function saveWithCustom(word) {
    const input = document.getElementById("lw-custom-input");
    const customTranslation = (input?.value || "").trim();
    if (!customTranslation) {
      return;
    }

    chrome.storage.local.get(["savedWords"], (result) => {
      const saved = result.savedWords || [];
      const existing = saved.findIndex((w) => w.word === word);
      const existingEntry = existing >= 0 ? saved[existing] : null;
      const ai = state.lastPopupAiData;
      const entry = {
        ...existingEntry,
        word,
        displayWord: existingEntry?.displayWord || word,
        translation: customTranslation,
        isCustomTranslation: true,
        synonyms: state.lastPopupSynonyms.length ? state.lastPopupSynonyms : (existingEntry?.synonyms || []),
        antonyms: state.lastPopupAntonyms.length ? state.lastPopupAntonyms : (existingEntry?.antonyms || []),
        source: existingEntry?.source || window.location.hostname,
        savedAt: new Date().toLocaleDateString()
      };

      if (existing >= 0) {
        saved[existing] = entry;
      } else {
        saved.unshift(entry);
      }

      chrome.storage.local.set({ savedWords: saved }, () => {
        renderSavedTab();
        showToast("Word saved ✓");
        closeWordPopup();
      });
    });
  }

  async function getFullWordData(word, sentenceContext) {
    // Fetch dictionary data and AI data in parallel
    const [dictEntries, aiData] = await Promise.all([
      fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
        .then(r => r.ok ? r.json() : [])
        .catch(() => []),
      (async () => {
        try {
          const apiKey = await new Promise(resolve => {
            chrome.storage.local.get(["anthropicApiKey"], result => resolve(result.anthropicApiKey || ""));
          });
          if (!apiKey) return null;
          const resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "anthropic-dangerous-direct-browser-access": "true"
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-20250514",
              max_tokens: 1200,
              messages: [{
                role: "user",
                content: `The user is a Somali student learning English. They clicked the word "${word}". The subtitle line was: "${sentenceContext}"

Respond ONLY in this exact JSON format, no other text:
{
  "contextExplanation": "2-3 simple sentences explaining the word in this context",
  "somalTranslation": "main somali translation",
  "alternatives": ["somali alt1", "somali alt2", "somali alt3"],
  "synonyms": ["syn1", "syn2", "syn3", "syn4", "syn5", "syn6", "syn7", "syn8"],
  "synonymsSomali": ["somali1", "somali2", "somali3"],
  "antonyms": ["ant1", "ant2", "ant3", "ant4"]
}`
              }]
            })
          });
          const data = await resp.json();
          return JSON.parse(data.content[0].text);
        } catch (_e) {
          return null;
        }
      })()
    ]);

    // Fetch Datamuse synonyms in parallel (rel_syn = synonyms, rel_ant = antonyms, ml = related)
    const [datamuseSyn, datamuseAnt, datamuseMl] = await Promise.all([
      fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=15`)
        .then(r => r.json()).then(arr => arr.map(x => x.word)).catch(() => []),
      fetch(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(word)}&max=8`)
        .then(r => r.json()).then(arr => arr.map(x => x.word)).catch(() => []),
      fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(word)}&max=10`)
        .then(r => r.json()).then(arr => arr.map(x => x.word)).catch(() => [])
    ]);

    // Extract dict synonyms/antonyms from Free Dictionary entries
    const dictSyns = [];
    const dictAnts = [];
    for (const entry of dictEntries) {
      for (const meaning of (entry.meanings || [])) {
        for (const def of (meaning.definitions || [])) {
          dictSyns.push(...(def.synonyms || []));
          dictAnts.push(...(def.antonyms || []));
        }
        dictSyns.push(...(meaning.synonyms || []));
        dictAnts.push(...(meaning.antonyms || []));
      }
    }

    // Merge and deduplicate synonyms from all 3 sources (AI first = highest quality)
    const aiSyns = aiData?.synonyms || [];
    const allSyns = [...new Set([...aiSyns, ...dictSyns, ...datamuseSyn, ...datamuseMl])]
      .filter(s => s && s.toLowerCase() !== word.toLowerCase())
      .slice(0, 30);

    const aiAnts = aiData?.antonyms || [];
    const allAnts = [...new Set([...aiAnts, ...dictAnts, ...datamuseAnt])]
      .filter(s => s && s.toLowerCase() !== word.toLowerCase())
      .slice(0, 12);

    return {
      aiData,
      dictEntries,
      synonyms: allSyns,
      antonyms: allAnts
    };
  }

  async function getAllExamples(word, dictEntries, currentLine) {
    // Phase 1: collect examples from dictionary
    const dictExamples = [];
    for (const entry of (dictEntries || [])) {
      for (const meaning of (entry.meanings || [])) {
        for (const def of (meaning.definitions || [])) {
          if (def.example) {
            dictExamples.push({ text: def.example, source: "dict" });
          }
        }
      }
      if (dictExamples.length >= 5) break;
    }

    // Phase 2: AI-generated examples
    let aiExamples = [];
    try {
      const apiKey = await new Promise(resolve => {
        chrome.storage.local.get(["anthropicApiKey"], result => resolve(result.anthropicApiKey || ""));
      });
      if (apiKey) {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 800,
            messages: [{
              role: "user",
              content: `Generate 10 short, clear example sentences using the English word "${word}". The student's context was: "${currentLine || ""}". Make sentences simple enough for a language learner. Return ONLY a JSON array of strings, no other text: ["sentence1", "sentence2", ...]`
            }]
          })
        });
        const data = await resp.json();
        const parsed = JSON.parse(data.content[0].text);
        if (Array.isArray(parsed)) {
          aiExamples = parsed.map(t => ({ text: t, source: "ai" }));
        }
      }
    } catch (_e) {
      // Ignore AI example fallback failures.
    }

    // Current subtitle as first example if available
    const currentEx = currentLine ? [{ text: currentLine, source: "current" }] : [];

    // Merge: current first, then dict, then AI (deduplicate by normalised text)
    const seen = new Set();
    const merged = [];
    for (const ex of [...currentEx, ...dictExamples, ...aiExamples]) {
      const key = ex.text.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(ex);
      }
      if (merged.length >= 15) break;
    }
    return merged;
  }

  function highlightWordInText(escapedHtml, word) {
    if (!word) return escapedHtml;
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(${escapedWord})`, "gi");
    return escapedHtml.replace(re, '<mark class="lw-word-highlight">$1</mark>');
  }

  function pronounceSentence(text) {
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.82;
    const voices = window.speechSynthesis.getVoices();
    const bestVoice = voices.find(v => v.name.includes("Samantha")) ||
                      voices.find(v => v.name.includes("Google US English")) ||
                      voices.find(v => v.lang === "en-US");
    if (bestVoice) utterance.voice = bestVoice;
    window.speechSynthesis.speak(utterance);
  }

  async function translateToSomali(text, fallback) {
    const key = text.trim();
    if (!key) {
      return "";
    }

    if (state.translationCache[key]) {
      return state.translationCache[key];
    }

    try {
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|so`
      );
      const data = await response.json();
      const translation = data.responseData?.translatedText?.trim() || fallback;
      state.translationCache[key] = translation;
      return translation;
    } catch (_error) {
      return fallback;
    }
  }

  async function saveWord(word, translation) {
    const savedWords = await getSavedWords();
    if (savedWords.some((entry) => entry.word === word)) {
      showToast("Already saved");
      return;
    }

    const entry = {
      word,
      translation,
      savedAt: new Date().toLocaleDateString()
    };

    savedWords.unshift(entry);
    await setSavedWords(savedWords);
    await renderSavedTab();
    showToast("Word saved! ✓");
  }

  async function deleteWord(word) {
    const savedWords = await getSavedWords();
    const filtered = savedWords.filter((entry) => entry.word !== word);
    await setSavedWords(filtered);
    await renderSavedTab();
  }

  async function pronounce(word) {
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      const data = await res.json();
      const audioUrl = data[0]?.phonetics?.find((p) => p.audio)?.audio;
      if (audioUrl) {
        new Audio(audioUrl.startsWith("//") ? `https:${audioUrl}` : audioUrl).play();
        return;
      }
    } catch (_error) {
      // Ignore dictionary audio lookup failures.
    }

    try {
      new Audio(`https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(word)}&tl=en&client=tw-ob`).play();
      return;
    } catch (_error) {
      // Ignore remote TTS fallback failures.
    }

    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    const voices = window.speechSynthesis.getVoices();
    const bestVoice = voices.find((v) => v.name.includes("Samantha")) ||
                      voices.find((v) => v.name.includes("Google US English")) ||
                      voices.find((v) => v.lang === "en-US");
    if (bestVoice) {
      utterance.voice = bestVoice;
    }
    window.speechSynthesis.speak(utterance);
  }

  function showToast(message) {
    const existing = document.getElementById("lw-toast");
    if (existing) {
      existing.remove();
    }

    const toast = document.createElement("div");
    toast.id = "lw-toast";
    toast.className = "lw-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  function getSavedWords() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["savedWords"], (result) => {
        resolve(result.savedWords || []);
      });
    });
  }

  function setSavedWords(savedWords) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ savedWords }, resolve);
    });
  }

  function decodeHtmlEntities(text) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      const replacements = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      };
      return replacements[character];
    });
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
