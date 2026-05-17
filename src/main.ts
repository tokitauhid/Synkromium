/**
 * main.ts — The front door of the entire app.
 *
 * This is where Electron starts up. It:
 * 1. Registers IPC handlers so the UI can talk to the backend
 * 2. Creates the system tray icon
 * 3. Opens the settings window (with glassmorphic UI)
 * 4. Initializes the sync engine if configured
 *
 * The app runs as a tray app by default. The settings window
 * opens on first run or when requested from the tray menu.
 */

import { app, BrowserWindow } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { TrayManager } from "./ui/tray.js";
import { detectInstalledBrowsers } from "./adapters/chromium/paths.js";
import { APP_NAME, SYNC_REPO_NAME } from "./config/constants.js";
import { getOrCreateDeviceIdentity } from "./device/identity.js";
import { registerIpcHandlers } from "./ipc/handlers.js";
import { loadSettings, isConfigured } from "./config/settings.js";

// ─── App Setup ──────────────────────────────────────────────────

// Where the sync repository lives on this machine.
const REPO_PATH = join(homedir(), SYNC_REPO_NAME);

// These get initialized when the app starts.
let trayManager: TrayManager | null = null;
let settingsWindow: BrowserWindow | null = null;

// ─── Electron App Lifecycle ─────────────────────────────────────

app.whenReady().then(async () => {
  console.log(`[${APP_NAME}] Starting up...`);

  // Identify this device.
  const device = getOrCreateDeviceIdentity();
  console.log(`[${APP_NAME}] Device: ${device.name} (${device.id})`);

  // Detect installed Chromium browsers.
  const browsers = detectInstalledBrowsers();
  console.log(`[${APP_NAME}] Found browsers: ${browsers.join(", ") || "none"}`);

  // Register IPC handlers BEFORE creating any windows.
  // This ensures the renderer can communicate with us immediately.
  registerIpcHandlers();
  console.log(`[${APP_NAME}] IPC handlers registered.`);

  // Make sure the sync repo directory exists.
  if (!existsSync(REPO_PATH)) {
    mkdirSync(REPO_PATH, { recursive: true });
  }

  // Create the tray icon.
  trayManager = new TrayManager();
  trayManager.create();

  // Wire up tray menu actions.
  trayManager.setCallbacks({
    onSyncNow: () => {
      console.log(`[${APP_NAME}] Sync triggered from tray.`);
      // Sync engine integration will happen here.
    },
    onOpenSettings: () => {
      openSettingsWindow();
    },
    onQuit: () => {
      shutdown();
    },
  });

  // Check if this is first run or not configured yet.
  const settings = loadSettings();
  if (!isConfigured(settings)) {
    console.log(`[${APP_NAME}] Not configured yet. Opening setup window.`);
    openSettingsWindow();
  } else {
    console.log(`[${APP_NAME}] Already configured. Running in tray.`);
    trayManager.updateStatus("idle", "Ready to sync.");
  }

  console.log(`[${APP_NAME}] Running.`);
});

// ─── Settings Window ────────────────────────────────────────────

function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  // Path to the preload script (compiled JS, not TS).
  const preloadPath = join(__dirname, "preload.js");

  settingsWindow = new BrowserWindow({
    width: 860,
    height: 620,
    minWidth: 700,
    minHeight: 500,
    title: `${APP_NAME}`,
    backgroundColor: "#0a0a1a",
    titleBarStyle: "hiddenInset",

    // On Linux/Windows, we show a custom frameless look.
    // On macOS, hiddenInset gives us the native traffic lights.
    frame: process.platform === "darwin",

    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the settings page.
  const rendererPath = join(__dirname, "ui", "renderer", "index.html");
  settingsWindow.loadFile(rendererPath);

  // Open DevTools in development (helps with debugging the UI).
  if (process.env["NODE_ENV"] === "development") {
    settingsWindow.webContents.openDevTools({ mode: "detach" });
  }

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

// ─── Shutdown ───────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  console.log(`[${APP_NAME}] Shutting down...`);

  if (trayManager) {
    trayManager.destroy();
  }

  app.quit();
}

// ─── Platform Quirks ────────────────────────────────────────────

// Keep the app alive when all windows are closed (we're a tray app).
app.on("window-all-closed", () => {
  // Do nothing — stay in the tray.
});

app.on("before-quit", () => {
  shutdown().catch(console.error);
});
