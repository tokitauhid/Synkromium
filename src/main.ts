import { app, BrowserWindow } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { existsSync, mkdirSync } from "node:fs";
import { TrayManager } from "./ui/tray.js";
import { detectInstalledBrowsers } from "./adapters/chromium/paths.js";
import { APP_NAME, SYNC_REPO_NAME } from "./config/constants.js";
import { getOrCreateDeviceIdentity } from "./device/identity.js";
import { registerIpcHandlers } from "./ipc/handlers.js";
import { loadSettings, isConfigured } from "./config/settings.js";
import { logger } from "./utils/logger.js";

const REPO_PATH = join(app.getPath("userData"), SYNC_REPO_NAME);

let trayManager: TrayManager | null = null;
let settingsWindow: BrowserWindow | null = null;

app.whenReady().then(async () => {
  logger.info("Starting up...");

  const device = getOrCreateDeviceIdentity();
  logger.info(`Device: ${device.name} (${device.id})`);

  const browsers = detectInstalledBrowsers();
  logger.info(`Found browsers: ${browsers.join(", ") || "none"}`);

  // Register IPC before creating windows so the renderer can talk to us immediately
  registerIpcHandlers();
  logger.info("IPC handlers registered.");

  if (!existsSync(REPO_PATH)) {
    mkdirSync(REPO_PATH, { recursive: true });
  }

  trayManager = new TrayManager();
  trayManager.create();

  trayManager.setCallbacks({
    onSyncNow: () => {
      logger.info("Sync triggered from tray.");
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
    logger.info("Not configured yet. Opening setup window.");
    openSettingsWindow();
  } else {
    logger.info("Already configured. Running in tray.");
    trayManager.updateStatus("idle", "Ready to sync.");
  }

  logger.info("Running.");
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

  settingsWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const levels = ["DEBUG", "INFO", "WARN", "ERROR"];
    const levelName = levels[level] || "INFO";
    logger.info(`[Renderer ${levelName}] ${message} (${sourceId}:${line})`);
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

let isShuttingDown = false;
async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info("Shutting down...");
  if (trayManager) trayManager.destroy();
  app.quit();
}

// Tray app — stay alive when all windows close
app.on("window-all-closed", () => {});

app.on("before-quit", () => {
  shutdown().catch((e) => logger.error("Error during shutdown:", e));
});
