/**
 * app.ts — The renderer-side logic for the settings window.
 *
 * This runs inside the Electron browser window (not the main process).
 * It handles the UI interactions: displaying device info, sync status,
 * and detected browsers.
 *
 * Right now, this is a simple display-only UI. In future steps,
 * it will gain IPC communication with the main process for
 * real-time status updates and conflict resolution.
 *
 * For the MVP, it reads data passed through the window's URL
 * params or waits for IPC messages from the main process.
 */

// ─── DOM Elements ───────────────────────────────────────────────

// Grab references to all the elements we'll update.
const statusDot = document.getElementById("status-indicator");
const statusText = document.getElementById("status-text");
const lastSyncText = document.getElementById("last-sync");
const deviceName = document.getElementById("device-name");
const deviceId = document.getElementById("device-id");
const devicePlatform = document.getElementById("device-platform");
const browserList = document.getElementById("browser-list");
const syncNowBtn = document.getElementById("btn-sync-now");
const viewLogBtn = document.getElementById("btn-view-log");

// ─── Status Display ─────────────────────────────────────────────

/**
 * Updates the status indicator and text.
 * Called when we receive a status update from the main process.
 */
function updateStatus(status: string, message: string): void {
  if (statusDot) {
    // Remove all status classes, then add the current one.
    statusDot.className = "status-dot";
    statusDot.classList.add(status);
  }

  if (statusText) {
    statusText.textContent = message;
  }
}

/**
 * Updates the "last synced" timestamp display.
 */
function updateLastSync(timestamp: string): void {
  if (lastSyncText) {
    if (timestamp) {
      const date = new Date(timestamp);
      lastSyncText.textContent = `Last synced: ${date.toLocaleString()}`;
    } else {
      lastSyncText.textContent = "Last synced: Never";
    }
  }
}

// ─── Device Info ────────────────────────────────────────────────

/**
 * Fills in the device information section.
 */
function setDeviceInfo(name: string, id: string, platform: string): void {
  if (deviceName) deviceName.textContent = name;
  if (deviceId) deviceId.textContent = id;
  if (devicePlatform) devicePlatform.textContent = platform;
}

// ─── Browser List ───────────────────────────────────────────────

/**
 * Populates the detected browsers list.
 */
function setBrowserList(browsers: string[]): void {
  if (!browserList) return;

  browserList.innerHTML = "";

  if (browsers.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No Chromium browsers detected";
    li.style.color = "#888";
    browserList.appendChild(li);
    return;
  }

  // Capitalize browser names for display.
  const prettyNames: Record<string, string> = {
    chrome: "Google Chrome",
    chromium: "Chromium",
    brave: "Brave Browser",
    edge: "Microsoft Edge",
  };

  for (const browser of browsers) {
    const li = document.createElement("li");
    li.textContent = prettyNames[browser] || browser;
    browserList.appendChild(li);
  }
}

// ─── Button Handlers ────────────────────────────────────────────

// These will be wired up to IPC calls in a future step.
// For now, they just update the UI to show feedback.

syncNowBtn?.addEventListener("click", () => {
  updateStatus("pushing", "Syncing...");
  syncNowBtn.setAttribute("disabled", "true");

  // Simulate a sync finishing after 2 seconds (placeholder).
  setTimeout(() => {
    updateStatus("idle", "Sync complete.");
    syncNowBtn.removeAttribute("disabled");
    updateLastSync(new Date().toISOString());
  }, 2000);
});

viewLogBtn?.addEventListener("click", () => {
  // In a future step, this will open the sync log.
  // For now, just show a message.
  console.log("View log clicked — will be implemented with IPC.");
});

// ─── Initialize ─────────────────────────────────────────────────

/**
 * Set up the initial state of the UI.
 * In the future, this will request real data from the main process via IPC.
 * For now, we show placeholder data.
 */
function initialize(): void {
  updateStatus("idle", "Ready to sync.");
  setDeviceInfo("This Computer", "—", navigator.platform || "Unknown");
  setBrowserList([]);
}

// Fire it up when the page loads.
initialize();
