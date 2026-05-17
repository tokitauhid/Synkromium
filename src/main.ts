/**
 * main.ts — The front door of the entire app.
 *
 * This is where Electron starts up. It:
 * 1. Creates the system tray icon
 * 2. Initializes the sync engine with the Chromium adapter
 * 3. Wires up the tray menu to sync controls
 * 4. Keeps running in the background (no main window needed)
 *
 * Think of this as the "receptionist" — it greets you (tray icon),
 * sets up the office (sync engine), and then quietly handles
 * everything in the background.
 *
 * The app intentionally has NO main window. It lives in the system
 * tray and does its job silently. The only time it speaks up is
 * when there's a conflict or error that needs your attention.
 */

import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { SyncEngine } from "./sync/engine.js";
import { ChromiumAdapter } from "./adapters/chromium/adapter.js";
import { TrayManager } from "./ui/tray.js";
import { detectInstalledBrowsers } from "./adapters/chromium/paths.js";
import { APP_NAME, SYNC_REPO_NAME } from "./config/constants.js";
import { getOrCreateDeviceIdentity } from "./device/identity.js";

// ─── App Setup ──────────────────────────────────────────────────

// Where the sync repository lives on this machine.
// Default: ~/synkromium-data (in the user's home directory).
const REPO_PATH = join(homedir(), SYNC_REPO_NAME);

// These get initialized when the app starts.
let syncEngine: SyncEngine | null = null;
let trayManager: TrayManager | null = null;
let settingsWindow: BrowserWindow | null = null;

// ─── Electron App Lifecycle ─────────────────────────────────────

/**
 * Electron fires "ready" when it's done initializing and we can
 * start creating windows, trays, etc.
 */
app.whenReady().then(async () => {
  console.log(`[${APP_NAME}] Starting up...`);

  // Identify this device.
  const device = getOrCreateDeviceIdentity();
  console.log(`[${APP_NAME}] Device: ${device.name} (${device.id})`);

  // Detect installed Chromium browsers.
  const browsers = detectInstalledBrowsers();
  console.log(`[${APP_NAME}] Found browsers: ${browsers.join(", ") || "none"}`);

  if (browsers.length === 0) {
    console.error(`[${APP_NAME}] No Chromium browsers found. Nothing to sync.`);
    // Still create the tray so the user can see what's going on.
  }

  // Create the tray icon.
  trayManager = new TrayManager();
  trayManager.create();

  // Make sure the sync repo directory exists.
  if (!existsSync(REPO_PATH)) {
    mkdirSync(REPO_PATH, { recursive: true });
  }

  // Set up the sync engine with the first detected browser.
  // For now, we sync the first Chromium browser we find.
  // Multi-browser support can come later.
  const targetBrowser = browsers[0] || "chrome";
  const adapter = new ChromiumAdapter(targetBrowser);

  syncEngine = new SyncEngine({
    repoPath: REPO_PATH,
    adapter,
    remoteUrl: "", // User configures this during first-run setup.
  });

  // Connect the sync engine's status updates to the tray icon.
  syncEngine.onStatusChange((status, message) => {
    trayManager?.updateStatus(status, message);
  });

  // Wire up tray menu actions.
  trayManager.setCallbacks({
    onSyncNow: () => {
      syncEngine?.syncNow().catch((err) => {
        console.error(`[${APP_NAME}] Manual sync failed:`, err);
      });
    },
    onOpenSettings: () => {
      openSettingsWindow();
    },
    onQuit: () => {
      shutdown();
    },
  });

  // Start the sync engine.
  try {
    await syncEngine.start();
  } catch (error) {
    console.error(`[${APP_NAME}] Failed to start sync engine:`, error);
    trayManager.updateStatus("error", "Failed to start. Check logs.");
  }

  console.log(`[${APP_NAME}] Running in system tray.`);
});

// ─── Settings Window ────────────────────────────────────────────

/**
 * Opens the settings window.
 * If it's already open, just focus it.
 */
function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 500,
    title: `${APP_NAME} Settings`,
    resizable: true,

    webPreferences: {
      // Security: don't give the renderer access to Node.js.
      // It communicates with the main process via IPC if needed.
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the settings page.
  const rendererPath = join(__dirname, "ui", "renderer", "index.html");
  settingsWindow.loadFile(rendererPath);

  // Clean up when the window is closed.
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

// ─── Shutdown ───────────────────────────────────────────────────

/**
 * Gracefully shuts down everything before quitting.
 * Stops the sync engine, destroys the tray, and exits.
 */
async function shutdown(): Promise<void> {
  console.log(`[${APP_NAME}] Shutting down...`);

  if (syncEngine) {
    await syncEngine.stop();
  }

  if (trayManager) {
    trayManager.destroy();
  }

  app.quit();
}

// ─── Platform Quirks ────────────────────────────────────────────

// On macOS, apps usually keep running even when all windows are closed.
// Since we're a tray app, we ALWAYS want to keep running.
app.on("window-all-closed", () => {
  // Do nothing — let the app stay alive in the tray.
});

// If someone tries to quit via Cmd+Q or system shutdown, clean up first.
app.on("before-quit", () => {
  shutdown().catch(console.error);
});
