const statusEl = document.getElementById("lw-popup-status");
const toggleButton = document.getElementById("lw-popup-toggle");
const saveButton = document.getElementById("lw-save-settings");
const saveStatus = document.getElementById("lw-save-status");

// ── Range value display ──────────────────────────────────────────
function bindRange(inputId, displayId, format) {
  const input = document.getElementById(inputId);
  const display = document.getElementById(displayId);
  if (!input || !display) return;
  input.addEventListener("input", () => {
    display.textContent = format(input.value);
  });
}

bindRange("lw-sub-fontsize", "lw-sub-fontsize-val", (v) => v);
bindRange("lw-sub-offset",   "lw-sub-offset-val",   (v) => v);
bindRange("lw-sub-opacity",  "lw-sub-opacity-val",  (v) => `${v}%`);

// ── Load saved settings on open ──────────────────────────────────
chrome.storage.local.get(["googleApiKey", "subtitleSettings"], (result) => {
  const apiKey = result.googleApiKey || "";
  document.getElementById("lw-api-key").value = apiKey;

  const s = result.subtitleSettings || {};
  if (s.enabled !== undefined)
    document.getElementById("lw-sub-enabled").value = String(s.enabled);
  if (s.mode)
    document.getElementById("lw-sub-mode").value = s.mode;
  if (s.order)
    document.getElementById("lw-sub-order").value = s.order;
  if (s.fontSize) {
    const el = document.getElementById("lw-sub-fontsize");
    el.value = s.fontSize;
    document.getElementById("lw-sub-fontsize-val").textContent = s.fontSize;
  }
  if (s.bottomOffset) {
    const el = document.getElementById("lw-sub-offset");
    el.value = s.bottomOffset;
    document.getElementById("lw-sub-offset-val").textContent = s.bottomOffset;
  }
  if (s.bgOpacity !== undefined) {
    const pct = Math.round(s.bgOpacity * 100);
    const el = document.getElementById("lw-sub-opacity");
    el.value = pct;
    document.getElementById("lw-sub-opacity-val").textContent = `${pct}%`;
  }
});

// ── Save settings ────────────────────────────────────────────────
saveButton.addEventListener("click", () => {
  const apiKey = document.getElementById("lw-api-key").value.trim();

  const subtitleSettings = {
    enabled: document.getElementById("lw-sub-enabled").value === "true",
    mode: document.getElementById("lw-sub-mode").value,
    order: document.getElementById("lw-sub-order").value,
    fontSize: Number(document.getElementById("lw-sub-fontsize").value),
    bottomOffset: Number(document.getElementById("lw-sub-offset").value),
    bgOpacity: Number(document.getElementById("lw-sub-opacity").value) / 100,
    lineSpacing: 6,
  };

  chrome.storage.local.set({ googleApiKey: apiKey, subtitleSettings }, () => {
    saveStatus.textContent = "Saved!";
    setTimeout(() => { saveStatus.textContent = ""; }, 2000);
  });
});

// ── Sidebar toggle ───────────────────────────────────────────────
function setStatus(message) {
  statusEl.textContent = message;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

toggleButton.addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) { setStatus("No active tab found."); return; }

    const response = await chrome.tabs.sendMessage(tab.id, { type: "LW_TOGGLE_SIDEBAR" });
    if (!response?.ok) { setStatus("Open a YouTube video page first."); return; }
    setStatus(response.open ? "Sidebar opened." : "Sidebar hidden.");
  } catch (_error) {
    setStatus("Reload the page after loading the extension.");
  }
});
