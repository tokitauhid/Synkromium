import { Tray, Menu, nativeImage, app } from "electron";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { SyncStatus } from "../sync/engine.js";
import { logger } from "../utils/logger.js";

export class TrayManager {
  private tray: Tray | null = null;
  private currentStatus: SyncStatus = "idle";
  private lastMessage: string = "Starting up...";
  private onSyncNow: (() => void) | null = null;
  private onOpenSettings: (() => void) | null = null;
  private onQuit: (() => void) | null = null;

  /** Resolves icon path for both packaged (electron-builder) and dev environments. */
  private getIconPath(): string {
    const iconName = "Synkromium_logo.svg";

    const prodPath = join(process.resourcesPath, "assets", iconName);
    if (existsSync(prodPath)) return prodPath;

    const devPath = join(app.getAppPath(), "..", "assets", iconName);
    if (existsSync(devPath)) return devPath;

    const fallbackPath = join(app.getAppPath(), "assets", iconName);
    if (existsSync(fallbackPath)) return fallbackPath;

    return "";
  }

  create(): void {
    const iconPath = this.getIconPath();
    let icon: Electron.NativeImage;

    if (iconPath) {
      icon = nativeImage.createFromPath(iconPath);
      icon = icon.resize({ width: 16, height: 16 });
    } else {
      logger.warn("Could not find tray icon, using empty placeholder.");
      icon = nativeImage.createEmpty();
    }

    this.tray = new Tray(icon);
    
    this.tray.setToolTip("Synkromium — Your browser, everywhere.");
    this.rebuildMenu();
  }

  updateStatus(status: SyncStatus, message: string): void {
    this.currentStatus = status;
    this.lastMessage = message;
    if (!this.tray) return;

    this.tray.setToolTip(`Synkromium ${this.getStatusEmoji(status)} ${message}`);
    this.rebuildMenu();
  }

  setCallbacks(callbacks: {
    onSyncNow?: () => void;
    onOpenSettings?: () => void;
    onQuit?: () => void;
  }): void {
    this.onSyncNow = callbacks.onSyncNow || null;
    this.onOpenSettings = callbacks.onOpenSettings || null;
    this.onQuit = callbacks.onQuit || null;
    this.rebuildMenu();
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }

  // Electron doesn't support updating menu items in-place, so we rebuild each time
  private rebuildMenu(): void {
    if (!this.tray) return;

    const emoji = this.getStatusEmoji(this.currentStatus);

    const menu = Menu.buildFromTemplate([
      {
        label: `${emoji} ${this.lastMessage}`,
        enabled: false,
      },
      { type: "separator" },
      {
        label: "↻ Sync Now",
        click: () => this.onSyncNow?.(),
        enabled: this.currentStatus === "idle",
      },
      {
        label: "⚙ Settings",
        click: () => this.onOpenSettings?.(),
      },
      { type: "separator" },
      {
        label: "Quit Synkromium",
        click: () => {
          if (this.onQuit) this.onQuit();
          else app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(menu);
  }

  private getStatusEmoji(status: SyncStatus): string {
    switch (status) {
      case "idle":     return "✓";
      case "pushing":  return "↑";
      case "pulling":  return "↓";
      case "error":    return "✕";
      case "conflict": return "⚠";
      default:         return "•";
    }
  }
}
