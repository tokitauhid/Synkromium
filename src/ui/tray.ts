/**
 * tray.ts — The little icon in your taskbar.
 *
 * This module manages the system tray icon that shows you
 * what Synkromium is doing at a glance:
 *   ✓ Idle (everything is in sync)
 *   ↻ Syncing (working on it...)
 *   ⚠ Conflict (needs your attention)
 *   ✕ Error (something went wrong)
 *
 * Right-clicking the icon gives you a menu with options like:
 *   - Sync Now
 *   - Open Settings
 *   - View Last Sync
 *   - Quit
 *
 * The tray icon is the primary way users interact with Synkromium.
 * Since the app runs in the background with no main window,
 * this little icon IS the app's face.
 */

import { Tray, Menu, nativeImage, app } from "electron";
import { join } from "node:path";
import { existsSync } from "node:fs";

import type { SyncStatus } from "../sync/engine.js";

// ─── Tray Manager ───────────────────────────────────────────────

export class TrayManager {
  private tray: Tray | null = null;
  private currentStatus: SyncStatus = "idle";
  private lastMessage: string = "Starting up...";

  // Callbacks for menu actions — the main process wires these up.
  private onSyncNow: (() => void) | null = null;
  private onOpenSettings: (() => void) | null = null;
  private onQuit: (() => void) | null = null;

  /**
   * Resolves the path to the app icon.
   * In production (packaged by electron-builder), assets are in process.resourcesPath/assets/.
   * In development, they're in the project root's assets/ directory.
   */
  private getIconPath(): string {
    const iconName = "Synkromium_logo.svg";

    // Packaged app: electron-builder copies extraResources to process.resourcesPath
    const prodPath = join(process.resourcesPath, "assets", iconName);
    if (existsSync(prodPath)) return prodPath;

    // Development: assets/ is in the project root (one level up from dist/)
    const devPath = join(app.getAppPath(), "..", "assets", iconName);
    if (existsSync(devPath)) return devPath;

    // Fallback: look relative to app path directly
    const fallbackPath = join(app.getAppPath(), "assets", iconName);
    if (existsSync(fallbackPath)) return fallbackPath;

    return ""; // Will fall through to createEmpty()
  }

  /**
   * Creates the system tray icon and its right-click menu.
   * Call this once during app startup.
   */
  create(): void {
    // Load the real Synkromium logo and resize it for the system tray.
    const iconPath = this.getIconPath();
    let icon: Electron.NativeImage;

    if (iconPath) {
      icon = nativeImage.createFromPath(iconPath);
      // Resize to 16x16 for proper tray icon display (most platforms).
      icon = icon.resize({ width: 16, height: 16 });
    } else {
      console.warn("[Synkromium] Could not find tray icon, using empty placeholder.");
      icon = nativeImage.createEmpty();
    }

    this.tray = new Tray(icon);

    this.tray.setToolTip("Synkromium — Your browser, everywhere.");
    this.rebuildMenu();
  }

  /**
   * Updates the tray icon and tooltip to reflect the current sync status.
   * Called by the sync engine whenever the status changes.
   */
  updateStatus(status: SyncStatus, message: string): void {
    this.currentStatus = status;
    this.lastMessage = message;

    if (!this.tray) return;

    // Update the tooltip to show the current status.
    const statusEmoji = this.getStatusEmoji(status);
    this.tray.setToolTip(`Synkromium ${statusEmoji} ${message}`);

    // Rebuild the menu so the status line updates.
    this.rebuildMenu();
  }

  /**
   * Wire up callbacks for menu actions.
   * The main process provides these so the tray can trigger syncs,
   * open windows, etc.
   */
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

  /**
   * Removes the tray icon. Called during app shutdown.
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }

  // ── Internal ──

  /**
   * Rebuilds the right-click context menu.
   * We rebuild it every time the status changes because Electron
   * doesn't support updating menu items in-place.
   */
  private rebuildMenu(): void {
    if (!this.tray) return;

    const statusEmoji = this.getStatusEmoji(this.currentStatus);

    const menu = Menu.buildFromTemplate([
      {
        label: `${statusEmoji} ${this.lastMessage}`,
        enabled: false, // This is just a status display, not clickable.
      },
      { type: "separator" },
      {
        label: "↻ Sync Now",
        click: () => this.onSyncNow?.(),
        enabled: this.currentStatus === "idle", // Can't sync while already syncing.
      },
      {
        label: "⚙ Settings",
        click: () => this.onOpenSettings?.(),
      },
      { type: "separator" },
      {
        label: "Quit Synkromium",
        click: () => {
          if (this.onQuit) {
            this.onQuit();
          } else {
            app.quit();
          }
        },
      },
    ]);

    this.tray.setContextMenu(menu);
  }

  /**
   * Returns a status emoji for display in the tray tooltip and menu.
   * These are universal and don't require any special icon files.
   */
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
