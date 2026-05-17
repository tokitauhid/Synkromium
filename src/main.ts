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

const REPO_PATH = join(homedir(), SYNC_REPO_NAME);

let trayManager: TrayManager | null = null;
let settingsWindow: BrowserWindow | null = null;

app.whenReady().then(async () => {
  console.log(`[${APP_NAME}] Starting up...`);

  const device = getOrCreateDeviceIdentity();
  console.log(`[${APP_NAME}] Device: ${device.name} (${device.id})`);

  const browsers = detectInstalledBrowsers();
  console.log(`[${APP_NAME}] Found browsers: ${browsers.join(", ") || "none"}`);

  // Register IPC before creating windows so the renderer can talk to us immediately
  registerIpcHandlers();
  console.log(`[${APP_NAME}] IPC handlers registered.`);

  if (!existsSync(REPO_PATH)) {
    mkdirSync(REPO_PATH, { recursive: true });
  }

  trayManager = new TrayManager();
  trayManager.create();

  trayManager.setCallbacks({
    onSyncNow: () => {
      console.log(`[${APP_NAME}] Sync triggered from tray.`);
    },
    onOpenSettings: () => {
      openSettingsWindow();
    },
    onQuit: () => {
      shutdown();
    },
  });

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

function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 860,
    height: 620,
    minWidth: 700,
    minHeight: 500,
    title: `${APP_NAME}`,
    backgroundColor: "#0a0a1a",
    titleBarStyle: "hiddenInset",
    frame: process.platform === "darwin",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  settingsWindow.loadFile(join(__dirname, "ui", "renderer", "index.html"));

  if (process.env["NODE_ENV"] === "development") {
    settingsWindow.webContents.openDevTools({ mode: "detach" });
  }

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

let isShuttingDown = false;
async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[${APP_NAME}] Shutting down...`);
  if (trayManager) trayManager.destroy();
  app.quit();
}

// Tray app — stay alive when all windows close
app.on("window-all-closed", () => {});

app.on("before-quit", () => {
  shutdown().catch(console.error);
});
