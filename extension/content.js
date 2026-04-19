(function initLingoWatch() {
  // Guard: extension context can be invalidated when the extension is reloaded
  // while the tab is still open. Bail out silently in that case.
  try {
    if (!chrome?.runtime?.id) return;
  } catch (_e) { return; }

  if (window.__lingoWatchLoaded) {
    return;
  }

  window.__lingoWatchLoaded = true;
  console.log("LingoWatch loaded");

  const BACKEND_BASE_URL = "http://127.0.0.1:8000";
  const YOUTUBE_HOST_PATTERN = /(^|\.)youtube\.com$/i;
  const POPUP_AI_TIMEOUT_MS = 45000;
  const POPUP_SOMALI_TIMEOUT_MS = 30000;
  const POPUP_REGENERATE_PROVIDERS = [
    { value: "deepseek", label: "DeepSeek" },
    { value: "gemini-lite", label: "Gemini Lite" },
    { value: "gemini", label: "Gemini" },
    { value: "grok", label: "Grok" },
    { value: "openrouter", label: "OpenRouter" },
    { value: "cerebras", label: "Cerebras" },
    { value: "glm4", label: "GLM-4.7" },
  ];
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
    subtitleSessionId: 0,
    ignoreLiveCaptionUntil: 0,
    translationCache: Object.create(null),
    frequencyData: {},
    ignoredWords: new Set(),
    starredLines: new Set(),
    overlayRequestId: 0,
    popupRequestId: 0,
    wordFastCache: new Map(),
    wordAiCache: new Map(),
    wordSomaliCache: new Map(),
    ttsAudioCache: new Map(),
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
    currentPopupRegenerate: null,
    playerUiHost: null,
    elements: {}
  };

  const groupLabels = [
    "Rank 1-1000",
    "Rank 1001-3000",
    "Rank 3001-5000",
    "Rank 5001-8000",
    "Rank 8001+"
  ];

  function hasLiveExtensionContext() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch (_error) {
      return false;
    }
  }

  function safeRuntimeGetUrl(path) {
    if (!hasLiveExtensionContext()) {
      return "";
    }

    try {
      return chrome.runtime.getURL(path);
    } catch (_error) {
      return "";
    }
  }

  function safeRuntimeSendMessage(message, callback) {
    if (!hasLiveExtensionContext()) {
      callback?.(null);
      return false;
    }

    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime?.lastError) {
          callback?.(null);
          return;
        }

        callback?.(response);
      });
      return true;
    } catch (_error) {
      callback?.(null);
      return false;
    }
  }

  async function safeRuntimeSendMessageAsync(message) {
    if (!hasLiveExtensionContext()) {
      return null;
    }

    try {
      return await chrome.runtime.sendMessage(message);
    } catch (_error) {
      return null;
    }
  }

  function safeStorageLocalGet(keys, callback) {
    if (!hasLiveExtensionContext()) {
      callback?.({});
      return;
    }

    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime?.lastError) {
          callback?.({});
          return;
        }

        callback?.(result || {});
      });
    } catch (_error) {
      callback?.({});
    }
  }

  function safeStorageLocalSet(value, callback) {
    if (!hasLiveExtensionContext()) {
      callback?.();
      return;
    }

    try {
      chrome.storage.local.set(value, () => {
        callback?.();
      });
    } catch (_error) {
      callback?.();
    }
  }

  loadFrequencyData();
  setupMessaging();
  setupKeyboardShortcuts();
  watchPageChanges();
  attemptAttachVideo();

  function setupMessaging() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "SUBTITLE_URL_FOUND") {
        if (isYouTubePage() && getYouTubeVideoId()) {
          return;
        }
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

    // savedWords now synced via Neon — no local storage listener needed
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
        resetSubtitleState();
        const result = original.apply(this, args);
        setTimeout(() => {
          attemptAttachVideo(true);
        }, 300);
        return result;
      };
    };

    wrapHistoryMethod("pushState");
    wrapHistoryMethod("replaceState");
    window.addEventListener("popstate", () => {
      resetSubtitleState();
      setTimeout(() => {
        attemptAttachVideo(true);
      }, 300);
    });

    window.addEventListener("yt-navigate-start", () => {
      resetSubtitleState();
    });

    window.addEventListener("yt-navigate-finish", () => {
      clearTimeout(state.attachVideoTimer);
      state.attachVideoTimer = setTimeout(() => {
        attemptAttachVideo(true);
      }, 150);
    });

    // YouTube fires this after it updates ytInitialPlayerResponse for the new
    // video.  If the first load attempt ran while the response was stale (old
    // video data), we would have gotten no subtitles; retry here once the
    // correct player response is in place.
    window.addEventListener("yt-page-data-updated", () => {
      if (!isYouTubePage() || state.subtitles.length) {
        return;
      }
      const videoId = getYouTubeVideoId();
      if (!videoId) {
        renderSubtitleStatus("Open a YouTube video to load subtitles.");
        return;
      }
      const sessionId = state.subtitleSessionId;
      fetchYouTubeCaptionTrack(sessionId).then((loaded) => {
        if (!loaded && sessionId === state.subtitleSessionId && !state.subtitles.length) {
          fetchYouTubeTranscript(videoId, sessionId);
        }
      });
    });
  }

  function resetSubtitleState() {
    clearTimeout(state.noSubtitleTimer);
    state.currentSubtitleKey = "";
    state.currentSubtitleUrl = "";
    state.subtitleSource = "";
    state.subtitles = [];
    state.currentIndex = -1;
    state.subtitleSessionId += 1;
    state.ignoreLiveCaptionUntil = Date.now() + 1500;
    clearOverlay();
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
    // Auto-open sidebar on every page/video load
    if (!state.sidebarOpen) toggleSidebar(true);
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

    // Fallback: read YouTube's live caption DOM when VTT subtitles aren't loaded
    let liveCaptionObserver = null;
    function startLiveCaptionObserver() {
      const container = document.querySelector(".ytp-caption-window-container");
      if (!container || liveCaptionObserver) return;
      liveCaptionObserver = new MutationObserver(() => {
        if (state.subtitles.length) return; // VTT subtitles loaded — no need
        if (Date.now() < state.ignoreLiveCaptionUntil) return;
        const segments = container.querySelectorAll(".ytp-caption-segment");
        const text = Array.from(segments).map(s => s.textContent || "").join(" ").replace(/\s+/g, " ").trim();
        if (!text) return; // don't clear — keep last subtitle visible
        dispatchSubtitle(text, "");
      });
      liveCaptionObserver.observe(container, { childList: true, subtree: true, characterData: true });
    }

    // Try immediately, and also after a short delay for late-loading CC
    startLiveCaptionObserver();
    const liveObserverTimer = setTimeout(startLiveCaptionObserver, 3000);

    state.videoSyncCleanup = () => {
      eventNames.forEach((eventName) => {
        video.removeEventListener(eventName, sync);
      });
      liveCaptionObserver?.disconnect();
      liveCaptionObserver = null;
      clearTimeout(liveObserverTimer);
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

    let activeFullscreenHost = null;
    let activeFullscreenMain = null;
    let previousFullscreenHostDisplay = "";
    let previousFullscreenHostAlignItems = "";
    let previousFullscreenHostJustifyContent = "";
    let previousFullscreenHostGap = "";
    let previousFullscreenHostBoxSizing = "";
    let previousFullscreenHostPadding = "";
    let previousFullscreenHostOverflow = "";

    const resetFullscreenHostLayout = () => {
      if (!activeFullscreenHost) {
        return;
      }

      if (activeFullscreenMain?.isConnected) {
        while (activeFullscreenMain.firstChild) {
          activeFullscreenHost.insertBefore(activeFullscreenMain.firstChild, activeFullscreenMain);
        }
        activeFullscreenMain.classList.remove("lw-fullscreen-main");
        activeFullscreenMain.remove();
      }

      activeFullscreenHost.classList.remove("lw-fullscreen-layout");

      if (previousFullscreenHostDisplay) {
        activeFullscreenHost.style.setProperty("display", previousFullscreenHostDisplay);
      } else {
        activeFullscreenHost.style.removeProperty("display");
      }

      if (previousFullscreenHostAlignItems) {
        activeFullscreenHost.style.setProperty("align-items", previousFullscreenHostAlignItems);
      } else {
        activeFullscreenHost.style.removeProperty("align-items");
      }

      if (previousFullscreenHostJustifyContent) {
        activeFullscreenHost.style.setProperty("justify-content", previousFullscreenHostJustifyContent);
      } else {
        activeFullscreenHost.style.removeProperty("justify-content");
      }

      if (previousFullscreenHostGap) {
        activeFullscreenHost.style.setProperty("gap", previousFullscreenHostGap);
      } else {
        activeFullscreenHost.style.removeProperty("gap");
      }

      if (previousFullscreenHostBoxSizing) {
        activeFullscreenHost.style.setProperty("box-sizing", previousFullscreenHostBoxSizing);
      } else {
        activeFullscreenHost.style.removeProperty("box-sizing");
      }

      if (previousFullscreenHostPadding) {
        activeFullscreenHost.style.setProperty("padding", previousFullscreenHostPadding);
      } else {
        activeFullscreenHost.style.removeProperty("padding");
      }

      if (previousFullscreenHostOverflow) {
        activeFullscreenHost.style.setProperty("overflow", previousFullscreenHostOverflow);
      } else {
        activeFullscreenHost.style.removeProperty("overflow");
      }

      activeFullscreenHost = null;
      activeFullscreenMain = null;
      previousFullscreenHostDisplay = "";
      previousFullscreenHostAlignItems = "";
      previousFullscreenHostJustifyContent = "";
      previousFullscreenHostGap = "";
      previousFullscreenHostBoxSizing = "";
      previousFullscreenHostPadding = "";
      previousFullscreenHostOverflow = "";
    };

    const applyFullscreenHostLayout = (host) => {
      if (activeFullscreenHost !== host) {
        resetFullscreenHostLayout();
        activeFullscreenHost = host;
        previousFullscreenHostDisplay = host.style.display || "";
        previousFullscreenHostAlignItems = host.style.alignItems || "";
        previousFullscreenHostJustifyContent = host.style.justifyContent || "";
        previousFullscreenHostGap = host.style.gap || "";
        previousFullscreenHostBoxSizing = host.style.boxSizing || "";
        previousFullscreenHostPadding = host.style.padding || "";
        previousFullscreenHostOverflow = host.style.overflow || "";
      }

      let main = Array.from(host.children).find((child) => child.id === "lw-fullscreen-main") || null;
      if (!main) {
        main = document.createElement("div");
        main.id = "lw-fullscreen-main";
        while (host.firstChild) {
          if (host.firstChild === sidebar) {
            break;
          }
          main.appendChild(host.firstChild);
        }
        host.insertBefore(main, sidebar.parentElement === host ? sidebar : null);
      }

      activeFullscreenMain = main;
      host.classList.add("lw-fullscreen-layout");
      main.classList.add("lw-fullscreen-main");
      main.style.setProperty("position", "relative", "important");
      main.style.setProperty("flex", "1 1 auto", "important");
      main.style.setProperty("min-width", "0", "important");
      main.style.setProperty("height", "100%", "important");
      main.style.setProperty("display", "flex", "important");
      main.style.setProperty("align-items", "center", "important");
      main.style.setProperty("justify-content", "center", "important");
      main.style.setProperty("overflow", "hidden", "important");

      host.style.setProperty("display", "flex", "important");
      host.style.setProperty("align-items", "stretch", "important");
      host.style.setProperty("justify-content", "flex-start", "important");
      host.style.setProperty("gap", "20px", "important");
      host.style.setProperty("box-sizing", "border-box", "important");
      host.style.setProperty("padding", "20px", "important");
      host.style.setProperty("overflow", "hidden", "important");
    };

    const syncLayout = () => {
      if (!sidebar.isConnected) {
        return;
      }

      const fullscreenHost = isYouTubePage() ? getSidebarFullscreenHost(video) : null;

      if (!isYouTubePage()) {
        resetFullscreenHostLayout();
        sidebar.classList.remove("lw-fullscreen-panel");
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

      if (fullscreenHost) {
        const maxPanelWidth = Math.max(220, fullscreenHost.clientWidth - 280);
        const panelWidth = Math.min(
          360,
          Math.max(260, Math.round(fullscreenHost.clientWidth * 0.28)),
          maxPanelWidth
        );

        applyFullscreenHostLayout(fullscreenHost);
        injectSidebar(sidebar, fullscreenHost);
        sidebar.classList.add("lw-fullscreen-panel");
        sidebar.style.setProperty("position", "relative", "important");
        sidebar.style.setProperty("top", "auto", "important");
        sidebar.style.setProperty("right", "auto", "important");
        sidebar.style.setProperty("left", "auto", "important");
        sidebar.style.setProperty("bottom", "auto", "important");
        sidebar.style.setProperty("flex", `0 0 ${panelWidth}px`, "important");
        sidebar.style.setProperty("width", `${panelWidth}px`, "important");
        sidebar.style.setProperty("height", "100%", "important");
        sidebar.style.setProperty("min-height", "0", "important");
        sidebar.style.setProperty("max-height", "100%", "important");
        sidebar.style.setProperty("margin-bottom", "0", "important");
        sidebar.style.setProperty("visibility", "visible", "important");
        sidebar.style.setProperty("pointer-events", "auto", "important");
        sidebar.style.setProperty("z-index", "1", "important");
        return;
      }

      if (sidebar.classList.contains("lw-fullscreen-panel")) {
        injectSidebar(sidebar);
      }

      resetFullscreenHostLayout();
      sidebar.classList.remove("lw-fullscreen-panel");
      const rect = video.getBoundingClientRect();
      const playerVisible = rect.bottom > 72 && rect.top < window.innerHeight - 72 && rect.width > 0 && rect.height > 0;

      sidebar.style.setProperty("position", "relative", "important");
      sidebar.style.removeProperty("top");
      sidebar.style.removeProperty("left");
      sidebar.style.removeProperty("right");
      sidebar.style.removeProperty("bottom");
      sidebar.style.setProperty("width", "100%", "important");
      sidebar.style.setProperty("height", "auto", "important");
      sidebar.style.removeProperty("min-height");
      sidebar.style.removeProperty("max-height");
      sidebar.style.setProperty("margin-bottom", "16px", "important");
      sidebar.style.setProperty("visibility", playerVisible ? "visible" : "hidden", "important");
      sidebar.style.setProperty("pointer-events", playerVisible ? "auto" : "none", "important");
      sidebar.style.removeProperty("z-index");
    };

    syncLayout();

    const resizeObserver = new ResizeObserver(() => {
      syncLayout();
    });
    resizeObserver.observe(video);

    const onWindowResize = () => syncLayout();
    window.addEventListener("resize", onWindowResize);
    window.addEventListener("scroll", onWindowResize, { passive: true });
    document.addEventListener("fullscreenchange", onWindowResize);
    document.addEventListener("webkitfullscreenchange", onWindowResize);

    state.sidebarLayoutCleanup = () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("scroll", onWindowResize);
      document.removeEventListener("fullscreenchange", onWindowResize);
      document.removeEventListener("webkitfullscreenchange", onWindowResize);
      resetFullscreenHostLayout();
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

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function getSidebarFullscreenHost(video) {
    const fullscreenElement = getFullscreenElement();
    if (!(fullscreenElement instanceof Element)) {
      return null;
    }

    if (video && fullscreenElement !== video && !fullscreenElement.contains(video) && !video.contains(fullscreenElement)) {
      return null;
    }

    const host = fullscreenElement.matches("#movie_player, .html5-video-player, .html5-video-container")
      ? fullscreenElement
      : fullscreenElement.querySelector("#movie_player, .html5-video-player, .html5-video-container") || fullscreenElement;

    if (window.getComputedStyle(host).position === "static") {
      host.style.setProperty("position", "relative", "important");
    }

    return host;
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
            <span class="lw-brand-title">Lingowatch</span>
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

    const popupArrow = document.createElement("div");
    popupArrow.id = "lw-popup-arrow";

    const tooltip = document.createElement("div");
    tooltip.id = "lw-hover-tooltip";

    state.elements = {
      sidebar,
      popup,
      popupArrow,
      tooltip,
      subtitleList: sidebar.querySelector("#lw-subtitle-list"),
      wordsPanel: sidebar.querySelector("#lw-words-panel"),
      savedList: sidebar.querySelector("#lw-saved-list")
    };

    mountFloatingElements();
    injectSidebar(sidebar);

    sidebar.addEventListener("click", handleSidebarClick);
    popup.addEventListener("click", handlePopupClick);
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("mouseover", handleWordHover);
    document.addEventListener("mouseout", handleWordHoverOut);

    // Load ignored words into state
    safeStorageLocalGet(["ignoredWords"], (result) => {
      (result.ignoredWords || []).forEach((w) => state.ignoredWords.add(w));
    });

    renderSavedTab();
  }

  function injectSidebar(sidebar, targetHost = null) {
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

    if (targetHost instanceof Element) {
      if (sidebar.parentElement !== targetHost) {
        targetHost.appendChild(sidebar);
      }
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

  function dispatchSubtitle(original, translation) {
    window.dispatchEvent(
      new CustomEvent("lw:subtitle", {
        detail: { original: original || "", translation: translation || "" },
      })
    );
  }

  function clearOverlay() {
    dispatchSubtitle("", "");
  }

  function pauseCurrentVideo() {
    const video = state.currentVideo;
    if (!video || video.paused) {
      return;
    }

    video.pause();
  }

  // Word clicked in the subtitle overlay -> open popup centered above that word.
  window.addEventListener("lw:word-click", (e) => {
    const { word, rect, subtitleContext } = e.detail ?? {};
    if (!word || !rect) return;
    closeHoverTooltip();
    pauseCurrentVideo();

    if (subtitleContext) state.subtitleClickContext = subtitleContext;

    const popupWidth = 380;
    const wordCenterX = rect.left + rect.width / 2;
    const left = Math.max(8, Math.min(wordCenterX - popupWidth / 2, window.innerWidth - popupWidth - 8));

    const anchorRect = {
      left,
      right: left + popupWidth,
      top: Number(rect.top),
      bottom: Number(rect.bottom),
      width: popupWidth,
      height: Number(rect.height) || Math.max(0, Number(rect.bottom) - Number(rect.top)),
    };

    state.lastAnchorRect = anchorRect;
    showWordPopup(word, anchorRect);
  });

  // Close popup on fullscreen change — coordinates are stale after layout shift
  function onFullscreenChange() {
    closeWordPopup();
  }

  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);

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

    const entry = {
      word: word.toLowerCase(),
      displayWord: word,
      translation,
      note,
      isManual: true,
      source: window.location.hostname,
    };

    saveWordToDb(entry).then(async () => {
      const savedWords = await getSavedWords();
      const alreadyExisted = savedWords.some((w) => w.word === word.toLowerCase());
      showToast(alreadyExisted ? `"${word}" updated ✓` : `"${word}" saved ✓`);
      renderSavedTab();
    });
    closeQuickSaveModal();
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
      pauseCurrentVideo();
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

  function handlePopupClick(event) {
    const button = event.target.closest("[data-popup-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.popupAction;
    const word = button.dataset.word || "";

    if (action === "close") { closeWordPopup(); return; }
    if (action === "speak") { pronounce(word); return; }
    if (action === "regenerate-menu") { toggleRegenerateMenu(); return; }
    if (action === "regenerate-word") {
      const provider = button.dataset.provider || "auto";
      toggleRegenerateMenu(false);
      if (typeof state.currentPopupRegenerate === "function") {
        state.currentPopupRegenerate(provider);
      }
      return;
    }
    if (action === "tab") { switchPopupTab(button.dataset.tab); return; }
    if (action === "save-word") { saveWordToLibrary(word); return; }
    if (action === "ignore") { ignoreWord(word); return; }
    if (action === "lookup-synonym") { lookupSynonym(word); return; }
    if (action === "pronounce-sentence") { pronounceSentence(button.dataset.text || ""); return; }
    if (action === "play-audio-url") {
      const url = button.dataset.url || "";
      if (url) { new Audio(url).play().catch(() => {}); }
      return;
    }
  }

  function handleDocumentClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    // Close popup when clicking the video player
    const popup = state.elements.popup;
    if (popup && popup.style.display !== "none") {
      const isInPopup = target.closest("#lw-word-popup");
      const isInSidebar = target.closest("#lw-sidebar");
      const isWord = target.closest(".lw-word") || target.closest(".lw-word-chip");
      if (!isInPopup && !isInSidebar && !isWord) {
        const video = state.currentVideo;
        if (video && (target === video || target.closest(".html5-video-player") || target.closest("#movie_player"))) {
          closeWordPopup();
          return;
        }
      }
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
      const frequencyUrl = safeRuntimeGetUrl("data/frequency.json");
      if (!frequencyUrl) {
        return;
      }

      const response = await fetch(frequencyUrl);
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
    const sessionId = state.subtitleSessionId;

    const youTubeVideoId = getYouTubeVideoId();
    const subtitleKey = youTubeVideoId ? `youtube:${youTubeVideoId}` : `page:${window.location.href}`;

    if (!forceReload && subtitleKey === state.currentSubtitleKey && state.subtitles.length) {
      return;
    }

    state.currentSubtitleKey = subtitleKey;
    state.currentSubtitleUrl = "";
    state.subtitleSource = "";
    state.currentIndex = -1;
    clearOverlay();

    if (youTubeVideoId) {
      const loadedFromYoutubeTrack = await fetchYouTubeCaptionTrack(sessionId);
      if (loadedFromYoutubeTrack) {
        return;
      }

      await fetchYouTubeTranscript(youTubeVideoId, sessionId);
      return;
    }

    startSubtitleSearch(sessionId);
  }

  function startSubtitleSearch(sessionId = state.subtitleSessionId) {
    renderSubtitleStatus("Looking for subtitles...");
    state.noSubtitleTimer = setTimeout(() => {
      if (!state.subtitles.length) {
        showNoSubtitlesMessage();
      }
    }, 8000);

    if (state.currentVideo) {
      tryTrackElement(state.currentVideo, sessionId);
    }

    checkAlreadyFoundSubtitles(sessionId);
    scanPageForSubtitleUrls(sessionId);
  }

  function checkAlreadyFoundSubtitles(sessionId = state.subtitleSessionId) {
    if (isYouTubePage() && getYouTubeVideoId()) {
      return;
    }

    safeRuntimeSendMessage({ type: "GET_SUBTITLE_URLS" }, (response) => {
      if (!response?.urls?.length) {
        return;
      }
      if (!state.subtitles.length) {
        handleSubtitleUrl(response.urls[response.urls.length - 1], sessionId);
      }
    });
  }

  function tryTrackElement(video, sessionId = state.subtitleSessionId) {
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
        handleSubtitleUrl(fullUrl, sessionId);
      }
    });

    // Watch for dynamically added <track> elements
    const trackObserver = new MutationObserver(() => {
      Array.from(video.querySelectorAll("track")).forEach((track) => {
        const src = track.src || track.getAttribute("src");
        if (src && !state.subtitles.length) {
          const fullUrl = src.startsWith("http") ? src : `${window.location.origin}${src}`;
          handleSubtitleUrl(fullUrl, sessionId);
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

  function scanPageForSubtitleUrls(sessionId = state.subtitleSessionId) {
    const vttPattern = /["'](https?:\/\/[^"']*\.(?:vtt|srt)[^"']*?)["']/gi;

    document.querySelectorAll("script").forEach((script) => {
      const matches = [...(script.textContent?.matchAll(vttPattern) || [])];
      matches.forEach((match) => {
        if (!state.subtitles.length) {
          handleSubtitleUrl(match[1], sessionId);
        }
      });
    });

    const html = document.documentElement?.innerHTML || "";
    const pageMatches = [...html.matchAll(vttPattern)];
    pageMatches.slice(0, 10).forEach((match) => {
      if (!state.subtitles.length) {
        handleSubtitleUrl(match[1], sessionId);
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

  function getYouTubePlayerElement() {
    return document.querySelector("#movie_player, .html5-video-player");
  }

  function ensurePlayerUiHost() {
    if (!isYouTubePage()) {
      return null;
    }

    const player = getYouTubePlayerElement();
    if (!(player instanceof HTMLElement)) {
      return null;
    }

    const computedPosition = window.getComputedStyle(player).position;
    if (computedPosition === "static") {
      player.style.position = "relative";
    }

    let host = document.getElementById("lw-player-ui-root");
    if (!(host instanceof HTMLElement)) {
      host = document.createElement("div");
      host.id = "lw-player-ui-root";
    }

    if (host.parentElement !== player) {
      player.appendChild(host);
    }

    state.playerUiHost = host;
    return host;
  }

  function mountFloatingElements() {
    const host = ensurePlayerUiHost();
    const parent = host || document.body;
    const floatingElements = [
      state.elements.popup,
      state.elements.popupArrow,
      state.elements.tooltip,
    ].filter(Boolean);

    floatingElements.forEach((element) => {
      if (element.parentElement !== parent) {
        parent.appendChild(element);
      }
    });

    return host;
  }

  function getFloatingHostRect() {
    const host = mountFloatingElements();
    if (!(host instanceof HTMLElement)) {
      return null;
    }

    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return rect;
  }

  function setFloatingElementPosition(element, left, top) {
    const hostRect = getFloatingHostRect();
    if (hostRect) {
      element.style.left = `${left - hostRect.left}px`;
      element.style.top = `${top - hostRect.top}px`;
      return;
    }

    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
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
    // Only accept player responses whose videoId matches the current URL.
    // During SPA navigation ytInitialPlayerResponse still holds the previous
    // video's data when yt-navigate-finish fires, causing old subtitles to
    // load under the new session ID (bypassing the sessionId guard entirely).
    const currentVideoId = getYouTubeVideoId();

    const sources = [];
    if (window.ytInitialPlayerResponse) {
      const responseVideoId = window.ytInitialPlayerResponse?.videoDetails?.videoId;
      if (!currentVideoId || responseVideoId === currentVideoId) {
        sources.push(window.ytInitialPlayerResponse);
      }
    }

    if (window.ytplayer?.config?.args?.player_response) {
      try {
        const parsed = JSON.parse(window.ytplayer.config.args.player_response);
        const responseVideoId = parsed?.videoDetails?.videoId;
        if (!currentVideoId || responseVideoId === currentVideoId) {
          sources.push(parsed);
        }
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

  async function fetchYouTubeCaptionTrack(sessionId = state.subtitleSessionId) {
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
      if (sessionId !== state.subtitleSessionId) {
        return false;
      }
      const subtitles = parseYouTubeCaptionPayload(rawText);
      if (!subtitles.length) {
        return false;
      }

      state.subtitleSource = "youtube-track";
      setSubtitles(subtitles, sessionId);
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

  async function fetchYouTubeTranscript(videoId, sessionId = state.subtitleSessionId) {
    if (!videoId || videoId === "null" || videoId === "undefined") {
      if (sessionId === state.subtitleSessionId) {
        setSubtitles([], sessionId);
        renderSubtitleStatus("Open a YouTube video to load subtitles.");
      }
      return;
    }

    try {
      const response = await fetch(`${BACKEND_BASE_URL}/transcript/${encodeURIComponent(videoId)}?lang=en`);
      const data = await response.json().catch(() => ({}));
      if (sessionId !== state.subtitleSessionId) {
        return;
      }
      const backendMessage = typeof data.detail === "string" ? data.detail : "";

      if (!response.ok || !Array.isArray(data.transcript)) {
        setSubtitles([], sessionId);
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
      setSubtitles(entries, sessionId);
    } catch (_error) {
      setSubtitles([], sessionId);
      renderSubtitleStatus("Could not reach the local transcript backend. Run `uvicorn main:app --host 0.0.0.0 --port 8000` inside backend/.");
    }
  }

  async function handleSubtitleUrl(url, sessionId = state.subtitleSessionId) {
    if (!url || url === state.currentSubtitleUrl) {
      return;
    }

    state.currentSubtitleUrl = url;
    renderSubtitleStatus("Loading captured subtitle file...");

    try {
      const response = await fetch(url);
      const text = await response.text();
      if (sessionId !== state.subtitleSessionId) {
        return;
      }
      const parsed = /\.srt(\?|$)/i.test(url) ? parseSRT(text) : parseVTT(text);
      state.subtitleSource = "captured-track";
      setSubtitles(parsed, sessionId);
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

  function setSubtitles(nextSubtitles, sessionId = state.subtitleSessionId) {
    if (sessionId !== state.subtitleSessionId) {
      return;
    }

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

    const speakIcon = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 5 6.8 8.5H4a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h2.8L11 19V5Z"/><path d="M15.5 8.5a4.5 4.5 0 0 1 0 7"/><path d="M18.5 6a8 8 0 0 1 0 12"/></svg>`;
    const deleteIcon = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M8 7l1 12h6l1-12"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>`;

    state.elements.savedList.innerHTML = savedWords.map((entry) => `
      <article class="lw-saved-item">
        <div class="lw-saved-main">
          <div class="lw-saved-top-row">
            <span class="lw-saved-word">${escapeHtml(entry.displayWord || entry.word)}</span>
            ${entry.isManual ? '<span class="lw-manual-badge">manual</span>' : ""}
            ${entry.isCustomTranslation ? '<span class="lw-custom-badge">custom</span>' : ""}
          </div>
          <div class="lw-saved-translation-row">
            <span class="lw-saved-flag">Somali</span>
            <span class="lw-saved-translation">
              ${entry.translation ? escapeHtml(entry.translation) : '<em class="lw-saved-fallback">No translation yet</em>'}
            </span>
          </div>
          ${entry.note ? `<div class="lw-saved-note">${escapeHtml(entry.note)}</div>` : ""}
          ${entry.synonyms?.length ? `
            <div class="lw-saved-synonyms">
              ${entry.synonyms.slice(0, 4).map((s) => `<span class="lw-saved-syn-chip">${escapeHtml(s)}</span>`).join("")}
            </div>
          ` : ""}
          <div class="lw-saved-meta">
            <span class="lw-saved-date">${escapeHtml(entry.savedAt)}</span>
            ${entry.source ? `<span class="lw-saved-source">${escapeHtml(entry.source)}</span>` : ""}
          </div>
        </div>
        <div class="lw-saved-actions">
          <button type="button" class="lw-saved-action-btn" data-saved-action="speak" data-word="${escapeAttribute(entry.word)}" aria-label="Listen to ${escapeAttribute(entry.word)}" title="Listen">
            ${speakIcon}
          </button>
          <button type="button" class="lw-saved-action-btn lw-saved-action-btn-danger" data-saved-action="delete" data-word="${escapeAttribute(entry.word)}" aria-label="Delete ${escapeAttribute(entry.word)}" title="Delete">
            ${deleteIcon}
          </button>
        </div>
      </article>
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
    const list = state.elements.subtitleList;
    const activeLine = list?.querySelector(`.lw-line[data-index="${index}"]`);
    if (!activeLine || !list) return;

    const parentRect = list.getBoundingClientRect();
    const lineRect = activeLine.getBoundingClientRect();
    const outsideVisibleRange = lineRect.top < parentRect.top + 60 || lineRect.bottom > parentRect.bottom - 60;
    if (outsideVisibleRange) {
      // Scroll only within the sidebar list, never the page
      const targetScrollTop = list.scrollTop + (lineRect.top - parentRect.top) - (parentRect.height / 2) + (lineRect.height / 2);
      list.scrollTo({ top: targetScrollTop, behavior: "smooth" });
    }
  }

  function updateOverlay(text) {
    if (!text) {
      clearOverlay();
      return;
    }

    dispatchSubtitle(text, "");
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

  function getRecommendedPopupProvider(word) {
    const normalized = String(word || "").trim().toLowerCase();
    const rank = getRank(normalized);
    const looksLikePhrase = /\s/.test(normalized) || normalized.includes("-");
    const isHard = looksLikePhrase || rank > 6000;
    return isHard
      ? { value: "gemini", label: "Gemini" }
      : { value: "deepseek", label: "DeepSeek" };
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

    const sidebar = state.elements.sidebar;
    const popupWidth = 380;
    if (sidebar && sidebar.isConnected) {
      const sRect = sidebar.getBoundingClientRect();
      const left = sRect.left - popupWidth - 24;
      const anchorRect = {
        left: Math.max(8, left),
        right: Math.max(8, left) + popupWidth,
        top: sRect.top - 30,
        bottom: sRect.top - 10,
        width: popupWidth,
        height: 20,
      };
      showWordPopup(word, anchorRect);
    } else {
      showWordPopup(word, target.getBoundingClientRect());
    }
  }

  function positionPopup(popup, rect) {
    const hostRect = getFloatingHostRect();
    const popupWidthTarget = hostRect
      ? Math.max(260, Math.min(380, hostRect.width - 24))
      : 380;
    popup.style.width = `${popupWidthTarget}px`;
    popup.style.maxHeight = hostRect
      ? `${Math.max(280, Math.min(420, hostRect.height - 24))}px`
      : "420px";

    const popupWidth = popup.offsetWidth || popupWidthTarget;
    const popupHeight = popup.offsetHeight || (hostRect ? Math.min(420, hostRect.height - 24) : 420);
    const gutter = 12;
    const arrowSize = 10;
    const minTop = 8;

    if (hostRect) {
      const anchorLeft = rect.left - hostRect.left;
      const anchorRight = rect.right - hostRect.left;
      const anchorTop = rect.top - hostRect.top;
      const anchorBottom = rect.bottom - hostRect.top;
      const anchorCenterX = anchorLeft + Math.max(0, anchorRight - anchorLeft) / 2;
      const maxLeft = Math.max(gutter, hostRect.width - popupWidth - gutter);

      const left = Math.max(gutter, Math.min(anchorCenterX - popupWidth / 2, maxLeft));

      const spaceAbove = anchorTop - gutter;
      const spaceBelow = hostRect.height - anchorBottom - gutter;
      const above = spaceAbove >= popupHeight || spaceAbove > spaceBelow;
      let top = above ? anchorTop - popupHeight - gutter : anchorBottom + gutter;
      const maxTop = Math.max(minTop, hostRect.height - popupHeight - gutter);
      top = Math.max(minTop, Math.min(top, maxTop));

      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;

      const arrow = state.elements.popupArrow;
      if (arrow) {
        const arrowLeft = Math.max(
          gutter,
          Math.min(anchorCenterX - arrowSize / 2, hostRect.width - arrowSize - gutter)
        );
        if (above) {
          arrow.dataset.placement = "below-popup";
          arrow.style.top = `${top + popupHeight - 6}px`;
          arrow.style.transform = "rotate(45deg)";
          arrow.style.borderTop = "none";
          arrow.style.borderLeft = "none";
          arrow.style.borderRight = "1px solid rgba(220,220,220,0.4)";
          arrow.style.borderBottom = "1px solid rgba(220,220,220,0.4)";
        } else {
          arrow.dataset.placement = "above-popup";
          arrow.style.top = `${top - arrowSize + 6}px`;
          arrow.style.transform = "rotate(45deg)";
          arrow.style.borderBottom = "none";
          arrow.style.borderRight = "none";
          arrow.style.borderTop = "1px solid rgba(220,220,220,0.4)";
          arrow.style.borderLeft = "1px solid rgba(220,220,220,0.4)";
        }
        arrow.style.left = `${arrowLeft}px`;
        arrow.style.display = "block";
      }
      return true;
    }

    const left = Math.max(gutter, Math.min(rect.left, window.innerWidth - popupWidth - gutter));

    let top;
    const spaceAbove = rect.top - gutter;
    const spaceBelow = window.innerHeight - rect.bottom - gutter;
    const above = spaceAbove >= popupHeight || spaceAbove > spaceBelow;
    if (above) {
      top = rect.top - popupHeight - gutter;
    } else {
      top = rect.bottom + gutter;
    }
    top = Math.max(minTop, Math.min(top, window.innerHeight - popupHeight - gutter));

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    // Position the arrow centered on the popup column
    const arrow = state.elements.popupArrow;
    if (arrow) {
      const arrowLeft = left + popupWidth / 2 - arrowSize / 2;
      if (above) {
        arrow.dataset.placement = "below-popup";
        arrow.style.top = `${top + popupHeight - 6}px`;
        arrow.style.transform = "rotate(45deg)";
        arrow.style.borderTop = "none";
        arrow.style.borderLeft = "none";
        arrow.style.borderRight = "1px solid rgba(220,220,220,0.4)";
        arrow.style.borderBottom = "1px solid rgba(220,220,220,0.4)";
      } else {
        arrow.dataset.placement = "above-popup";
        arrow.style.top = `${top - arrowSize + 6}px`;
        arrow.style.transform = "rotate(45deg)";
        arrow.style.borderBottom = "none";
        arrow.style.borderRight = "none";
        arrow.style.borderTop = "1px solid rgba(220,220,220,0.4)";
        arrow.style.borderLeft = "1px solid rgba(220,220,220,0.4)";
      }
      arrow.style.left = `${arrowLeft}px`;
      arrow.style.display = "block";
    }
    return true;
  }

  async function showWordPopup(word, rect) {
    ensureInterface();
    const popup = state.elements.popup;
    const requestId = ++state.popupRequestId;
    const currentLine = state.subtitleClickContext || state.subtitles[state.currentIndex]?.text || "";
    const normalizedWord = word.trim().toLowerCase();
    const aiCacheKey = `${normalizedWord}::general`;
    const recommendedProvider = getRecommendedPopupProvider(normalizedWord);
    const regenerateSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12A9 9 0 0 1 18.5 5.7"/><path d="M18 2v4h4"/><path d="M6 22v-4H2"/></svg>`;
    const regenerateOptions = POPUP_REGENERATE_PROVIDERS.map((provider) => `
      <button type="button" class="lw-regenerate-option${provider.value === recommendedProvider.value ? " recommended" : ""}" data-popup-action="regenerate-word" data-provider="${escapeAttribute(provider.value)}">
        <span>${escapeHtml(provider.label)}</span>
        ${provider.value === recommendedProvider.value ? `<span class="lw-regenerate-badge">Recommended</span>` : ""}
      </button>
    `).join("");

    popup.innerHTML = `
      <div class="lw-popup-header">
        <div class="lw-popup-header-left">
          <div class="lw-popup-word">${escapeHtml(word)}</div>
          <div class="lw-popup-phonetic" id="lw-popup-phonetic-el"></div>
          <div class="lw-popup-translation-main" id="lw-popup-translation-el">Finding meaning...</div>
        </div>
        <div class="lw-popup-header-right">
          <button type="button" class="lw-popup-speak" data-popup-action="speak" data-word="${escapeAttribute(word)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/></svg></button>
          <div class="lw-regenerate-wrap">
            <button type="button" class="lw-popup-regenerate" data-popup-action="regenerate-menu" title="Regenerate with another AI">${regenerateSvg}</button>
            <div class="lw-regenerate-menu" id="lw-regenerate-menu" hidden>
              <div class="lw-regenerate-menu-title">Regenerate with</div>
              ${regenerateOptions}
            </div>
          </div>
          <button type="button" class="lw-popup-close" data-popup-action="close">✕</button>
        </div>
      </div>
      <div class="lw-popup-body">
        <div class="lw-popup-tabs">
          <button type="button" class="lw-popup-tab active" data-popup-action="tab" data-tab="learn">Learn</button>
          <button type="button" class="lw-popup-tab" data-popup-action="tab" data-tab="usage">Usage</button>
          <button type="button" class="lw-popup-tab" data-popup-action="tab" data-tab="somali">Somali</button>
        </div>
        <div class="lw-popup-panel" id="lw-panel-learn"></div>
        <div class="lw-popup-panel" id="lw-panel-usage" style="display:none"></div>
        <div class="lw-popup-panel" id="lw-panel-somali" style="display:none"></div>
      </div>
      <div class="lw-popup-actions">
        <button type="button" class="lw-btn-save" id="lw-popup-save-btn" data-popup-action="save-word" data-word="${escapeAttribute(word)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
          Save word
        </button>
        <button type="button" class="lw-btn-ignore" data-popup-action="ignore" data-word="${escapeAttribute(word)}" title="Ignore">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
        <div class="lw-popup-links-inline">
          <a href="https://reverso.net/translation/english-somali/${encodeURIComponent(word)}" target="_blank" class="lw-popup-link">Re</a>
          <a href="https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(word)}" target="_blank" class="lw-popup-link">Ca</a>
          <a href="https://translate.google.com/?sl=en&tl=so&text=${encodeURIComponent(word)}" target="_blank" class="lw-popup-link">Gl</a>
        </div>
      </div>
    `;

    popup.style.display = "flex";
    if (!positionPopup(popup, rect)) return;

    // Prefetch TTS audio for the word immediately so it's ready when the icon is tapped
    prefetchTts(word);

    // Helpers
    const audioSvg = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/></svg>`;
    function audioBtn(text, small = false) {
      return `<button type="button" class="lw-example-audio-btn${small ? " small" : ""}" data-popup-action="pronounce-sentence" data-text="${escapeAttribute(text)}" title="Listen">${audioSvg(small ? 12 : 14)}</button>`;
    }
    function chips(list, cls = "", clickable = true) {
      return list.map((s) => {
        const action = clickable ? ` data-popup-action="lookup-synonym" data-word="${escapeAttribute(s)}"` : "";
        return `<span class="lw-synonym-chip${cls ? " " + cls : ""}"${action}>${escapeHtml(s)}</span>`;
      }).join("");
    }
    function loadingSpinner(label = "Loading") {
      return `
        <div class="lw-inline-loading" aria-label="${escapeAttribute(label)}">
          <span class="lw-inline-spinner"></span>
          <span>${escapeHtml(label)}</span>
        </div>
      `;
    }

    let fastData = state.wordFastCache.get(normalizedWord) || { dictEntries: [], synonyms: [], antonyms: [], tatoebaExamples: [] };
    let aiData = state.wordAiCache.get(aiCacheKey) || null;
    let somaliData = state.wordSomaliCache.get(aiCacheKey) || null;
    let quickTranslation = state.translationCache[normalizedWord] || "";
    let aiLoading = !aiData;
    let somaliLoading = !somaliData;
    let aiError = "";
    let somaliError = "";
    let regeneratingLabel = "";

    function renderPanels() {
      if (requestId !== state.popupRequestId) return;

      const { dictEntries, synonyms, antonyms, tatoebaExamples } = fastData;
      const meanings = dictEntries[0]?.meanings || [];
      const dictDef = meanings[0]?.definitions?.[0]?.definition || "";
      const examples = (aiData?.examples || []).filter(ex => ex.type !== "somali");
      const phonetic = dictEntries[0]?.phonetic || aiData?.pronunciationText || "";
      const rank = getRank(normalizedWord);
      const mergedAiData = { ...(aiData || {}), ...(somaliData || {}) };
      const translation = somaliData?.somaliMeaning || aiData?.somaliMeaning || quickTranslation || "";
      const somaliExplanation = somaliData?.somaliExplanation || aiData?.somaliExplanation || "";
      const somaliSentence = somaliData?.somaliSentence || aiData?.somaliSentence || "";
      const partOfSpeech = somaliData?.partOfSpeech || aiData?.partOfSpeech || "";
      const usageNote = somaliData?.usageNote || aiData?.usageNote || "";
      const sentenceTranslation = somaliData?.sentenceTranslation || aiData?.somaliSentenceTranslation || "";
      const contextNote = somaliData?.contextNote || aiData?.contextNote || "";
      const saveBtn = popup.querySelector("#lw-popup-save-btn");
      const activeLoadingLabel = regeneratingLabel ? `Regenerating with ${regeneratingLabel}` : "Loading AI explanation";
      const answeredBy = aiData?.aiProviderLabel || somaliData?.aiProviderLabel || "";

      state.lastPopupAiData = Object.keys(mergedAiData).length ? mergedAiData : aiData;
      state.lastPopupSynonyms = synonyms;
      state.lastPopupAntonyms = antonyms;
      popup.querySelector("#lw-popup-phonetic-el").textContent = phonetic;
      popup.querySelector("#lw-popup-translation-el").textContent = translation || (rank < 9999 ? `Rank ${rank}` : "Tap Save after meaning loads");
      if (saveBtn) saveBtn.dataset.translation = translation;

      const learnPanel = popup.querySelector("#lw-panel-learn");
      if (learnPanel) {
        learnPanel.innerHTML = `
          <div class="lw-easy-meaning-box" style="margin-top:10px">
            <div class="lw-easy-meaning-label">Instant</div>
            <div class="lw-easy-meaning-text">${escapeHtml(translation || (rank < 9999 ? `Frequency rank ${rank}. Full meaning is loading now.` : "Full meaning is loading now."))}</div>
          </div>
          ${aiData?.easyMeaning || dictDef ? `
            <div class="lw-easy-meaning-box" style="margin-top:10px">
              <div class="lw-easy-meaning-label">${aiData?.easyMeaning ? "Easy Meaning" : "Dictionary Meaning"}</div>
              <div class="lw-easy-meaning-text">${escapeHtml(aiData?.easyMeaning || dictDef)}</div>
            </div>
          ` : ""}
          ${aiData?.aiExplanation ? `
            <div class="lw-popup-divider"></div>
            <div class="lw-section-label">AI Explanation</div>
            ${answeredBy ? `<div class="lw-answered-by">Answered by ${escapeHtml(answeredBy)}</div>` : ""}
            <div class="lw-ai-explanation">${escapeHtml(aiData.aiExplanation)}</div>
          ` : aiLoading ? `
            <div class="lw-popup-divider"></div>
            <div class="lw-section-label">AI Explanation</div>
            ${loadingSpinner(activeLoadingLabel)}
          ` : aiError ? `
            <div class="lw-popup-divider"></div>
            <div class="lw-section-label">AI Explanation</div>
            <div class="lw-popup-empty">${escapeHtml(aiError)}</div>
          ` : ""}
          ${examples.length || tatoebaExamples?.length ? `
            <div class="lw-popup-divider"></div>
            <div class="lw-section-label">Example Sentences</div>
            <div class="lw-examples-list">
              ${examples.map((ex) => `
                <div class="lw-example-row">
                  ${ex.type ? `<span class="lw-example-type-tag">${escapeHtml(ex.type.toUpperCase())}</span>` : ""}
                  <span class="lw-example-row-text">${highlightWordInText(escapeHtml(ex.text), word)}${ex.translation ? `<span class="lw-example-row-translation">${escapeHtml(ex.translation)}</span>` : ""}</span>
                  ${audioBtn(ex.text, true)}
                </div>
              `).join("")}
              ${(tatoebaExamples || []).map(ex => `
                <div class="lw-example-row">
                  <span class="lw-example-type-tag lw-example-type-tag-real">Real</span>
                  <span class="lw-example-row-text">${highlightWordInText(escapeHtml(ex.text), word)}</span>
                  ${ex.audioUrl
                    ? `<button type="button" class="lw-example-audio-btn small" data-popup-action="play-audio-url" data-url="${escapeAttribute(ex.audioUrl)}" title="Listen">${audioSvg(12)}</button>`
                    : audioBtn(ex.text, true)
                  }
                </div>
              `).join("")}
            </div>
          ` : ""}
          ${synonyms.length ? `
            <div class="lw-popup-divider"></div>
            <div class="lw-section-label">Synonyms</div>
            <div class="lw-chips-wrap">${chips(synonyms)}</div>
          ` : ""}
          ${antonyms.length ? `
            <div class="lw-popup-divider"></div>
            <div class="lw-section-label">Antonyms</div>
            <div class="lw-chips-wrap">${chips(antonyms, "antonym")}</div>
          ` : ""}
          ${!aiData && !dictDef && !currentLine && !aiLoading ? `<div class="lw-popup-empty">No data found for "${escapeHtml(word)}"</div>` : ""}
        `;
      }

      const usagePanel = popup.querySelector("#lw-panel-usage");
      if (usagePanel) {
        const phrases = aiData?.relatedPhrases || [];
        usagePanel.innerHTML = `
          ${aiData?.usageContext ? `
            <div class="lw-usage-box">
              <div class="lw-usage-label">When People Use This</div>
              <div class="lw-usage-text">${escapeHtml(aiData.usageContext)}</div>
            </div>
          ` : aiLoading ? `<div class="lw-popup-empty">Usage explanation is waiting for your selected AI model to respond.</div>` : ""}
          ${aiData?.commonMistake ? `
            ${aiData?.usageContext ? `<div class="lw-popup-divider"></div>` : ""}
            <div class="lw-mistakes-box">
              <div class="lw-mistakes-label">Common Mistake</div>
              <div class="lw-mistakes-text">${escapeHtml(aiData.commonMistake)}</div>
            </div>
          ` : ""}
          ${phrases.length ? `
            <div class="lw-popup-divider"></div>
            <div class="lw-section-label">Related Phrases</div>
            <div class="lw-chips-wrap">
              ${phrases.map((p) => `<span class="lw-phrase-chip" data-popup-action="lookup-synonym" data-word="${escapeAttribute(p)}">${escapeHtml(p)}</span>`).join("")}
            </div>
          ` : ""}
          ${synonyms.length ? `
            <div class="lw-popup-divider"></div>
            <div class="lw-section-label">Synonyms</div>
            <div class="lw-chips-wrap">${chips(synonyms)}</div>
          ` : ""}
          ${antonyms.length ? `
            <div class="lw-popup-divider"></div>
            <div class="lw-section-label">Antonyms</div>
            <div class="lw-chips-wrap">${chips(antonyms, "antonym")}</div>
          ` : ""}
          ${!aiLoading && !aiData?.usageContext && !aiData?.commonMistake && !phrases.length && !synonyms.length && !antonyms.length ? `<div class="lw-popup-empty">${escapeHtml(aiError || "No usage data available")}</div>` : ""}
        `;
      }

      const somaliPanel = popup.querySelector("#lw-panel-somali");
      if (somaliPanel) {
        somaliPanel.innerHTML = `
          <div class="lw-somali-main-box">
            <div class="lw-somali-flag-row"><span class="lw-somali-word-label">Somali Support</span></div>
            ${translation ? `<div class="lw-somali-translation">${escapeHtml(translation)}</div>` : ""}
            ${partOfSpeech ? `<div class="lw-somali-note"><strong>Part of speech:</strong> ${escapeHtml(partOfSpeech)}</div>` : ""}
            ${somaliExplanation ? `<div class="lw-somali-note">${escapeHtml(somaliExplanation)}</div>` : ""}
            ${usageNote ? `<div class="lw-somali-note"><strong>Usage:</strong> ${escapeHtml(usageNote)}</div>` : ""}
            ${contextNote ? `<div class="lw-somali-note"><strong>Context:</strong> ${escapeHtml(contextNote)}</div>` : ""}
            ${somaliData?.aiProviderLabel ? `<div class="lw-somali-note">Somali AI: ${escapeHtml(somaliData.aiProviderLabel)}</div>` : ""}
            ${somaliLoading && !somaliData?.somaliMeaning ? `<div class="lw-somali-note">${quickTranslation ? "DeepSeek Somali explanation is still loading." : "DeepSeek Somali support is loading."}</div>` : ""}
          </div>
          ${somaliSentence ? `
            <div class="lw-popup-divider"></div>
            <div class="lw-section-label">Somali Example</div>
            <div class="lw-example-card">
              <div class="lw-example-content"><div class="lw-example-text" style="font-style:italic">${escapeHtml(somaliSentence)}</div></div>
              ${sentenceTranslation ? `<div class="lw-example-content"><div class="lw-example-translation">${escapeHtml(sentenceTranslation)}</div></div>` : ""}
            </div>
          ` : ""}
          ${!somaliLoading && !translation ? `<div class="lw-popup-empty">${escapeHtml(somaliError || aiError || "No Somali data available")}</div>` : ""}
        `;
      }

      positionPopup(popup, rect);
    }

    renderPanels();

    state.currentPopupRegenerate = async (provider) => {
      if (requestId !== state.popupRequestId) return;

      const providerConfig = POPUP_REGENERATE_PROVIDERS.find((item) => item.value === provider);
      regeneratingLabel = providerConfig?.label || provider;
      aiData = null;
      somaliData = null;
      aiLoading = true;
      somaliLoading = true;
      aiError = "";
      somaliError = "";
      state.wordAiCache.delete(aiCacheKey);
      state.wordSomaliCache.delete(aiCacheKey);
      renderPanels();

      const [nextAiData, nextSomaliData] = await Promise.all([
        getAIWordData(word, "", provider, true),
        getSomaliSupportData(word, "", provider, true),
      ]);

      if (requestId !== state.popupRequestId) return;

      aiData = nextAiData;
      somaliData = nextSomaliData;
      aiLoading = false;
      somaliLoading = false;
      aiError = nextAiData ? "" : `${regeneratingLabel} did not answer after 45 seconds.`;
      somaliError = nextSomaliData ? "" : `${regeneratingLabel} Somali support did not answer after 30 seconds.`;
      regeneratingLabel = "";

      if (nextAiData) setLimitedCache(state.wordAiCache, aiCacheKey, nextAiData);
      if (nextSomaliData) setLimitedCache(state.wordSomaliCache, aiCacheKey, nextSomaliData);
      renderPanels();
    };

    if (!quickTranslation) {
      void translateToSomali(normalizedWord, "").then((result) => {
        if (requestId !== state.popupRequestId || !result) return;
        quickTranslation = result;
        renderPanels();
      });
    }

    if (!state.wordFastCache.has(normalizedWord)) {
      void getFastWordData(word).then((result) => {
        fastData = result;
        setLimitedCache(state.wordFastCache, normalizedWord, result);
        renderPanels();
      });
    }

    if (!state.wordAiCache.has(aiCacheKey)) {
      void getAIWordData(word, "", recommendedProvider.value).then((result) => {
        aiData = result;
        aiLoading = false;
        aiError = result ? "" : "The AI provider did not answer after 45 seconds. Try again or choose another model in settings.";
        if (result) {
          setLimitedCache(state.wordAiCache, aiCacheKey, result);
          // Prefetch TTS for all example sentences so they're ready instantly
          (result.examples || []).forEach(ex => { if (ex.text) prefetchTts(ex.text); });
        }
        renderPanels();
      });
    }

    if (!state.wordSomaliCache.has(aiCacheKey)) {
      void getSomaliSupportData(word, "").then((result) => {
        somaliData = result;
        somaliLoading = false;
        somaliError = result ? "" : "DeepSeek Somali support did not answer after 30 seconds.";
        if (result) setLimitedCache(state.wordSomaliCache, aiCacheKey, result);
        renderPanels();
      });
    }
  }

  function closeWordPopup() {
    if (state.elements.popup) {
      state.elements.popup.style.display = "none";
      state.popupRequestId++;
      state.currentPopupRegenerate = null;
    }
    if (state.elements.popupArrow) {
      state.elements.popupArrow.style.display = "none";
    }
  }

  function lookupSynonym(word) {
    closeWordPopup();
    state.subtitleClickContext = "";
    setTimeout(() => {
      const sidebar = state.elements.sidebar;
      const popupWidth = 380;
      let rect;
      if (sidebar && sidebar.isConnected) {
        const sRect = sidebar.getBoundingClientRect();
        const left = Math.max(8, sRect.left - popupWidth - 24);
        rect = { left, right: left + popupWidth, top: sRect.top - 30, bottom: sRect.top - 10, width: popupWidth, height: 20 };
      } else {
        rect = { left: window.innerWidth / 2 - 190, top: window.innerHeight / 2 - 220, right: window.innerWidth / 2 + 190, bottom: window.innerHeight / 2 - 200 };
      }
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

  function toggleRegenerateMenu(forceOpen) {
    const menu = state.elements.popup?.querySelector("#lw-regenerate-menu");
    if (!menu) {
      return;
    }

    const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : menu.hidden;
    menu.hidden = !shouldOpen;
  }

  function handleWordHover(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    const popupOpen = isElementVisible(state.elements.popup);
    const overlayWordTarget = target.closest(".lw-overlay-word");
    if (popupOpen && overlayWordTarget) {
      clearTimeout(state.hoverTimer);
      closeHoverTooltip();
      return;
    }

    const wordEl = target.closest(".lw-word");
    const lineEl = target.closest(".lw-line");
    const lineHoverTarget = lineEl && !wordEl && !target.closest("[data-line-action]") && !target.closest(".lw-timestamp");

    if (!wordEl && !lineHoverTarget) {
      return;
    }

    clearTimeout(state.hoverTimer);

    if (wordEl) {
      const word = (wordEl.dataset.word || "").trim().toLowerCase();
      state.hoverTimer = setTimeout(() => {
        if (!wordEl.isConnected) {
          return;
        }

        showHoverTooltip(wordEl, word, wordEl.getBoundingClientRect());
      }, 400);
      return;
    }

    state.hoverTimer = setTimeout(() => {
      if (!lineEl.isConnected) {
        return;
      }

      showLineHoverTooltip(lineEl, {
        x: event.clientX,
        y: event.clientY,
      });
    }, 250);
  }

  function handleWordHoverOut(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    const relatedTarget = event.relatedTarget instanceof Element ? event.relatedTarget : null;

    const wordEl = target.closest(".lw-word");
    const lineEl = target.closest(".lw-line");
    if (!wordEl && !lineEl) {
      return;
    }

    if (wordEl && relatedTarget && wordEl.contains(relatedTarget)) {
      return;
    }

    if (lineEl && relatedTarget && lineEl.contains(relatedTarget)) {
      return;
    }

    clearTimeout(state.hoverTimer);
    setTimeout(() => {
      closeHoverTooltip();
    }, 120);
  }

  function isElementVisible(element) {
    return !!element && window.getComputedStyle(element).display !== "none";
  }

  function getTooltipBounds() {
    const player = document.querySelector("#movie_player, .html5-video-player, .html5-video-container, #lw-subtitle-root");
    if (player instanceof Element) {
      const rect = player.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return rect;
      }
    }

    const video = state.currentVideo;
    if (!video) {
      return null;
    }

    const rect = video.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }

    return rect;
  }

  function positionHoverTooltip(tooltip, wordRect, options = {}) {
    const gutter = 12;
    const tooltipWidth = tooltip.offsetWidth || 260;
    const tooltipHeight = tooltip.offsetHeight || 140;
    const sidebar = state.elements.sidebar;
    const sidebarRect = sidebar?.isConnected ? sidebar.getBoundingClientRect() : null;
    const boundsRect = getTooltipBounds();
    const popupEl = state.elements.popup;
    const popupOpen = isElementVisible(popupEl);
    const overlayAnchored = Boolean(options.overlayAnchored);

    let left;
    let top;

    if (overlayAnchored) {
      left = wordRect.left + wordRect.width / 2 - tooltipWidth / 2;
      top = wordRect.top - tooltipHeight - gutter;

      const minTop = boundsRect ? Math.max(gutter, boundsRect.top + gutter) : gutter;
      if (top < minTop) {
        top = wordRect.bottom + gutter;
      }
    } else if (popupOpen) {
      const popupRect = popupEl.getBoundingClientRect();
      if (sidebarRect && sidebarRect.width > 0) {
        left = sidebarRect.left - tooltipWidth - 24;
      } else {
        left = popupRect.left;
      }
      top = popupRect.bottom + gutter;

      if (top + tooltipHeight > window.innerHeight - gutter) {
        top = Math.max(gutter, popupRect.top - tooltipHeight - gutter);
      }
    } else {
      if (sidebarRect && sidebarRect.width > 0) {
        left = sidebarRect.left - tooltipWidth - 24;
        top = wordRect.top + wordRect.height / 2 - tooltipHeight / 2;
      } else {
        left = wordRect.left + wordRect.width / 2 - tooltipWidth / 2;
        top = wordRect.bottom + gutter;
        if (top + tooltipHeight > window.innerHeight - gutter) {
          top = Math.max(gutter, wordRect.top - tooltipHeight - gutter);
        }
      }
    }

    const minLeft = boundsRect ? Math.max(gutter, boundsRect.left + gutter) : gutter;
    const maxLeft = boundsRect
      ? Math.max(minLeft, boundsRect.right - tooltipWidth - gutter)
      : window.innerWidth - tooltipWidth - gutter;
    const minTop = boundsRect ? Math.max(gutter, boundsRect.top + gutter) : gutter;
    const maxTop = boundsRect
      ? Math.max(minTop, boundsRect.bottom - tooltipHeight - gutter)
      : window.innerHeight - tooltipHeight - gutter;

    left = Math.max(minLeft, Math.min(left, maxLeft));
    top = Math.max(minTop, Math.min(top, maxTop));

    setFloatingElementPosition(tooltip, left, top);
  }

  function positionLineHoverTooltip(tooltip, lineRect, anchorPoint) {
    const gutter = 10;
    const tooltipWidth = tooltip.offsetWidth || 320;
    const tooltipHeight = tooltip.offsetHeight || 120;
    const sidebar = state.elements.sidebar;
    const sidebarRect = sidebar?.isConnected ? sidebar.getBoundingClientRect() : null;
    const boundsRect = getTooltipBounds();

    const anchorY = anchorPoint?.y ?? (lineRect.top + lineRect.height / 2);

    let left;
    let top = anchorY - tooltipHeight / 2;

    if (sidebarRect && sidebarRect.width > 0) {
      left = sidebarRect.left - tooltipWidth - 24;
    } else {
      const anchorX = anchorPoint?.x ?? (lineRect.left + lineRect.width / 2);
      left = anchorX - tooltipWidth / 2;
    }

    const minLeft = boundsRect ? Math.max(gutter, boundsRect.left + gutter) : gutter;
    const maxLeft = boundsRect
      ? Math.max(minLeft, boundsRect.right - tooltipWidth - gutter)
      : window.innerWidth - tooltipWidth - gutter;
    const minTop = boundsRect ? Math.max(gutter, boundsRect.top + gutter) : gutter;
    const maxTop = boundsRect
      ? Math.max(minTop, boundsRect.bottom - tooltipHeight - gutter)
      : window.innerHeight - tooltipHeight - gutter;

    left = Math.max(minLeft, Math.min(left, maxLeft));
    top = Math.max(minTop, Math.min(top, maxTop));

    setFloatingElementPosition(tooltip, left, top);
  }

  function getHoverPhraseCandidates(wordEl) {
    const baseWord = (wordEl.dataset.word || wordEl.textContent || "").trim().toLowerCase();
    if (!baseWord) {
      return [];
    }

    const lineContent = wordEl.closest(".lw-line-content");
    if (!lineContent) {
      return [baseWord];
    }

    const wordElements = Array.from(lineContent.querySelectorAll(".lw-word"));
    const wordIndex = wordElements.indexOf(wordEl);
    if (wordIndex === -1) {
      return [baseWord];
    }

    const nextWords = wordElements
      .slice(wordIndex, wordIndex + 4)
      .map((element) => cleanWord(element.textContent || "").toLowerCase())
      .filter(Boolean);

    const candidates = [];
    for (let length = 1; length <= nextWords.length; length += 1) {
      const phrase = nextWords.slice(0, length).join(" ").trim();
      if (phrase && !candidates.includes(phrase)) {
        candidates.push(phrase);
      }
    }

    return candidates;
  }

  function getPrimaryHoverMeaning(translation) {
    const normalized = (translation || "").trim();
    if (!normalized) {
      return "";
    }

    return normalized
      .split(/[;,]/)
      .map((part) => part.trim())
      .filter(Boolean)[0] || normalized;
  }

  async function showHoverTooltip(wordEl, word, rect) {
    if (!word) word = (wordEl.dataset.word || wordEl.textContent || "").trim().toLowerCase();
    if (!word) return;

    const tooltip = state.elements.tooltip;
    if (!tooltip) return;
    const overlayAnchored = wordEl.classList.contains("lw-overlay-word");
    tooltip.classList.toggle("lw-hover-tooltip-compact", overlayAnchored);

    if (!rect) rect = wordEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > window.innerHeight) return;

    tooltip.style.display = "block";
    tooltip.innerHTML = `<div class="lw-ht-primary"><div class="lw-ht-word">${escapeHtml(word)}</div><div class="lw-ht-translation">...</div></div>`;
    positionHoverTooltip(tooltip, rect, { overlayAnchored });

    const hoveredLine = wordEl.closest(".lw-line");
    const hoveredSubtitle = hoveredLine ? state.subtitles[Number(hoveredLine.dataset.index)] : null;
    const contextText = hoveredSubtitle?.text || state.subtitles[state.currentIndex]?.text || "";
    const phraseCandidates = getHoverPhraseCandidates(wordEl);

    const [candidateTranslations, lineTranslation] = await Promise.all([
      Promise.all(phraseCandidates.map((candidate) => translateToSomali(candidate, ""))),
      contextText ? translateToSomali(contextText, "") : Promise.resolve("")
    ]);

    if (tooltip.style.display === "none") {
      return;
    }

    const translationOptions = phraseCandidates.reduce((options, candidate, index) => {
      const translation = (candidateTranslations[index] || "").trim();
      if (!translation) {
        return options;
      }

      const normalizedTranslation = candidate.includes(" ")
        ? translation
        : getPrimaryHoverMeaning(translation);

      if (!normalizedTranslation) {
        return options;
      }

      const isDuplicate = options.some((option) => option.translation === normalizedTranslation);
      if (!isDuplicate) {
        options.push({ phrase: candidate, translation: normalizedTranslation });
      }
      return options;
    }, []);

    const primaryOption = translationOptions[0] || { phrase: word, translation: word };
    const extraOptions = translationOptions
      .filter((option, index) => index > 0 && option.phrase.includes(" "))
      .slice(0, 3);

    tooltip.innerHTML = `
      <div class="lw-ht-primary">
        <div class="lw-ht-word">${escapeHtml(primaryOption.phrase)}</div>
        <div class="lw-ht-translation">${escapeHtml(primaryOption.translation)}</div>
      </div>
      ${extraOptions.length ? `
        <div class="lw-ht-options">
          ${extraOptions.map((option) => `
            <div class="lw-ht-option">
              <div class="lw-ht-option-phrase">${escapeHtml(option.phrase)}</div>
              <div class="lw-ht-option-translation">${escapeHtml(option.translation)}</div>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${!overlayAnchored && lineTranslation ? `<div class="lw-ht-divider"></div><div class="lw-ht-sentence">${escapeHtml(lineTranslation)}</div>` : ""}
    `;
    positionHoverTooltip(tooltip, rect, { overlayAnchored });
  }

  async function showLineHoverTooltip(lineEl, anchorPoint) {
    const tooltip = state.elements.tooltip;
    if (!tooltip) return;
    tooltip.classList.remove("lw-hover-tooltip-compact");

    const index = Number(lineEl.dataset.index);
    const subtitle = state.subtitles[index];
    if (!subtitle?.text) return;

    const rect = lineEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > window.innerHeight) return;

    tooltip.style.display = "block";
    tooltip.innerHTML = `<div class="lw-ht-sentence-only">...</div>`;
    positionLineHoverTooltip(tooltip, rect, anchorPoint);

    const translation = await translateToSomali(subtitle.text, "");
    if (tooltip.style.display === "none") {
      return;
    }

    tooltip.innerHTML = `<div class="lw-ht-sentence-only">${escapeHtml(translation || subtitle.text)}</div>`;
    positionLineHoverTooltip(tooltip, rect, anchorPoint);
  }

  function closeHoverTooltip() {
    if (state.elements.tooltip) {
      state.elements.tooltip.style.display = "none";
    }
  }

  function ignoreWord(word) {
    const normalizedWord = word.toLowerCase();
    state.ignoredWords.add(normalizedWord);
    safeStorageLocalGet(["ignoredWords"], (result) => {
      const ignored = result.ignoredWords || [];
      if (!ignored.includes(normalizedWord)) {
        ignored.push(normalizedWord);
        safeStorageLocalSet({ ignoredWords: ignored });
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

    saveWordToDb({
      word: word.toLowerCase(),
      displayWord: word,
      translation: customTranslation,
      isCustomTranslation: true,
      source: window.location.hostname,
    }).then(() => {
      renderSavedTab();
      showToast("Word saved ✓");
      closeWordPopup();
    });
  }

  async function saveWordToLibrary(word) {
    const ai = state.lastPopupAiData;
    const btn = document.getElementById("lw-popup-save-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }

    const phraseId = crypto.randomUUID();
    const now = new Date().toISOString();

    const payload = {
      id: phraseId,
      phraseText: word,
      phraseType: ai?.phraseType || "word",
      category: "YouTube",
      notes: "",
      difficultyLevel: "intermediate",
      explanation: ai ? {
        id: crypto.randomUUID(),
        phraseId,
        standardMeaning: ai.standardMeaning || "",
        easyMeaning: ai.easyMeaning || "",
        aiExplanation: ai.aiExplanation || "",
        usageContext: ai.usageContext || "",
        somaliMeaning: ai.somaliMeaning || "",
        partOfSpeech: ai.partOfSpeech || "",
        somaliExplanation: ai.somaliExplanation || "",
        somaliSentence: ai.somaliSentence || "",
        somaliSentenceTranslation: ai.somaliSentenceTranslation || ai.sentenceTranslation || "",
        usageNote: ai.usageNote || "",
        contextNote: ai.contextNote || "",
        commonMistake: ai.commonMistake || "",
        pronunciationText: ai.pronunciationText || "",
        relatedPhrases: ai.relatedPhrases || [],
      } : null,
      examples: (ai?.examples || []).map(ex => ({
        id: crypto.randomUUID(),
        phraseId,
        exampleText: ex.text,
        exampleType: ex.type,
        translationText: ex.translation || "",
      })),
    };

    try {
      await fetch("http://127.0.0.1:3001/api/extension/save-phrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (_e) {}

    // Save to Neon
    await saveWordToDb({ word: word.toLowerCase(), displayWord: word, translation: ai?.somaliMeaning || "", source: window.location.hostname });
    renderSavedTab();

    if (btn) {
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Saved!`;
      btn.style.background = "rgba(34,197,94,0.2)";
      btn.style.borderColor = "rgba(34,197,94,0.4)";
      btn.style.color = "#4ade80";
    }
    showToast(`"${word}" saved to library ✓`);
    setTimeout(() => closeWordPopup(), 800);
  }

  function withTimeout(promise, timeoutMs, fallback) {
    let timeoutId;
    const timeout = new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
  }

  function setLimitedCache(cache, key, value, limit = 80) {
    if (cache.has(key)) {
      cache.delete(key);
    }
    cache.set(key, value);
    while (cache.size > limit) {
      cache.delete(cache.keys().next().value);
    }
  }

  async function getAIWordData(word, sentenceContext, preferredProvider, strictProvider = false) {
    return withTimeout(
      fetch("http://127.0.0.1:3001/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phraseText: word, sentenceContext, preferredProvider, strictProvider }),
      })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
      POPUP_AI_TIMEOUT_MS,
      null
    );
  }

  async function getSomaliSupportData(word, sentenceContext, preferredProvider, strictProvider = false) {
    return withTimeout(
      fetch("http://127.0.0.1:3001/api/extension/somali-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, sentenceContext, preferredProvider, strictProvider }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data || (!data.somaliMeaning && !data.somaliExplanation && !data.somaliSentence && !data.contextNote)) return null;
          return data;
        })
        .catch(() => null),
      POPUP_SOMALI_TIMEOUT_MS,
      null
    );
  }

  async function getFastWordData(word) {
    const dictPromise = withTimeout(
      fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
        .then(r => r.ok ? r.json() : [])
        .catch(() => []),
      2500,
      []
    );

    const [dictEntries, datamuseSyn, datamuseAnt, tatoebaExamples] = await Promise.all([
      dictPromise,
      withTimeout(
        fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=15`)
          .then(r => r.json()).then(arr => arr.map(x => x.word)).catch(() => []),
        2500,
        []
      ),
      withTimeout(
        fetch(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(word)}&max=8`)
          .then(r => r.json()).then(arr => arr.map(x => x.word)).catch(() => []),
        2500,
        []
      ),
      withTimeout(
        new Promise(resolve => {
          safeRuntimeSendMessage({ type: "FETCH_TATOEBA", word }, (response) => {
            resolve(response?.results || []);
          });
        }),
        2500,
        []
      )
    ]);

    // Extract dict synonyms/antonyms
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

    const allSyns = [...new Set([...dictSyns, ...datamuseSyn])]
      .filter(s => s && s.toLowerCase() !== word.toLowerCase()).slice(0, 20);
    const allAnts = [...new Set([...dictAnts, ...datamuseAnt])]
      .filter(s => s && s.toLowerCase() !== word.toLowerCase()).slice(0, 10);

    return { dictEntries, synonyms: allSyns, antonyms: allAnts, tatoebaExamples };
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
        safeStorageLocalGet(["anthropicApiKey"], (result) => resolve(result.anthropicApiKey || ""));
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

  function prefetchTts(text) {
    if (!text) return;
    const key = text.trim();
    if (state.ttsAudioCache.has(key)) return;
    fetch("http://127.0.0.1:3001/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: key }),
    }).then(r => r.ok ? r.json() : null).then(data => {
      if (!data) return;
      const audioSrc = data.audioUrl || (data.audioContent ? `data:audio/mpeg;base64,${data.audioContent}` : null);
      if (audioSrc) setLimitedCache(state.ttsAudioCache, key, audioSrc, 120);
    }).catch(() => {});
  }

  async function pronounceSentence(text) {
    if (!text) return;
    const cacheKey = text.trim();

    // 1. Try official Google Cloud TTS via local server (best quality)
    try {
      const cachedAudio = state.ttsAudioCache.get(cacheKey);
      if (cachedAudio) {
        await new Audio(cachedAudio).play();
        return true;
      }

      const controller = new AbortController();
      const ttsTimeout = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch("http://127.0.0.1:3001/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cacheKey }),
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          const audioSrc = data.audioUrl || (data.audioContent ? `data:audio/mpeg;base64,${data.audioContent}` : null);
          if (audioSrc) {
            setLimitedCache(state.ttsAudioCache, cacheKey, audioSrc, 120);
            await new Audio(audioSrc).play();
            return true;
          }
        }
      } finally {
        clearTimeout(ttsTimeout);
      }
    } catch (_e) {}

    return false;
  }

  function speakWithBrowser(text) {
    if (!window.speechSynthesis) {
      return false;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
    return true;
  }

  async function translateToSomali(text, fallback) {
    const key = text.trim();
    if (!key) {
      return fallback || "";
    }

    if (state.translationCache[key]) {
      return state.translationCache[key];
    }

    try {
      const response = await safeRuntimeSendMessageAsync({
        type: "TRANSLATE",
        text: key,
        target: "so",
      });
      const rawTranslation = response?.translation?.trim() || "";
      const translation = isMyMemoryWarning(rawTranslation) ? "" : rawTranslation || fallback || "";
      if (translation) {
        state.translationCache[key] = translation;
      }
      return translation;
    } catch (_error) {
      return fallback || "";
    }
  }

  function isMyMemoryWarning(value) {
    return String(value || "").trim().toUpperCase().startsWith("MYMEMORY WARNING");
  }

  async function saveWord(word, translation) {
    const savedWords = await getSavedWords();
    if (savedWords.some((entry) => entry.word === word)) {
      showToast("Already saved");
      return;
    }
    await saveWordToDb({ word: word.toLowerCase(), displayWord: word, translation, source: window.location.hostname });
    await renderSavedTab();
    showToast("Word saved! ✓");
  }

  async function deleteWord(word) {
    await deleteWordFromDb(word);
    await renderSavedTab();
  }

  async function pronounce(word) {
    await pronounceSentence(word);
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

  async function getSavedWords() {
    try {
      const res = await fetch("http://127.0.0.1:3001/api/words");
      if (!res.ok) return [];
      const rows = await res.json();
      return rows.map((r) => ({
        word: r.word,
        displayWord: r.display_word,
        translation: r.translation,
        note: r.note,
        source: r.source,
        isManual: r.is_manual,
        isCustomTranslation: r.is_custom_translation,
        savedAt: new Date(r.saved_at).toLocaleDateString(),
      }));
    } catch { return []; }
  }

  async function saveWordToDb(entry) {
    try {
      await fetch("http://127.0.0.1:3001/api/words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
    } catch { /* ignore */ }
  }

  async function deleteWordFromDb(word) {
    try {
      await fetch(`http://127.0.0.1:3001/api/words/${encodeURIComponent(word)}`, { method: "DELETE" });
    } catch { /* ignore */ }
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
