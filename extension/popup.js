const statusEl = document.getElementById("lw-popup-status");
const toggleButton = document.getElementById("lw-popup-toggle");

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

    if (!tab?.id) {
      setStatus("No active tab found.");
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: "LW_TOGGLE_SIDEBAR" });

    if (!response?.ok) {
      setStatus("Open a page with a video element first.");
      return;
    }

    setStatus(response.open ? "Sidebar opened." : "Sidebar hidden.");
  } catch (_error) {
    setStatus("Reload the page after loading the extension.");
  }
});
