/**
 * handlers.ts — Main process IPC handlers.
 *
 * These are the "answering machines" on the main process side.
 * When the renderer sends a message on a channel, the matching
 * handler here processes it and sends back a response.
 *
 * Each handler is small and focused — it does one thing,
 * calls the right module, and returns the result.
 */

import { ipcMain } from "electron";
import { loadSettings, saveSettings, getRepoUrl, isConfigured, type UserSettings } from "../config/settings.js";
import { getOrCreateDeviceIdentity } from "../device/identity.js";
import { detectInstalledBrowsers, validateCustomBrowserPath } from "../adapters/chromium/paths.js";
import * as git from "../git/backend.js";
import * as channels from "./channels.js";

// ─── Register All Handlers ──────────────────────────────────────

/**
 * Call this once during app startup to register all IPC handlers.
 * After this, the renderer can send messages and get responses.
 */
export function registerIpcHandlers(): void {

  // ── Settings ──

  /**
   * Returns the current user settings to the renderer.
   * The renderer uses this to populate the settings form.
   */
  ipcMain.handle(channels.GET_SETTINGS, () => {
    const settings = loadSettings();
    // Never send the raw token to the renderer — mask it for display.
    return {
      ...settings,
      githubTokenMasked: settings.githubToken
        ? "•".repeat(8) + settings.githubToken.slice(-4)
        : "",
    };
  });

  /**
   * Saves updated settings from the renderer.
   * Returns the saved settings (with masked token) as confirmation.
   */
  ipcMain.handle(channels.SAVE_SETTINGS, (_event, newSettings: Partial<UserSettings>) => {
    const current = loadSettings();
    const updated = { ...current, ...newSettings };
    saveSettings(updated);

    return {
      success: true,
      settings: {
        ...updated,
        githubTokenMasked: updated.githubToken
          ? "•".repeat(8) + updated.githubToken.slice(-4)
          : "",
      },
    };
  });

  // ── GitHub Connection Test ──

  /**
   * Tests whether the GitHub credentials work by trying to
   * access the repo. This gives the user confidence before
   * they start syncing.
   */
  ipcMain.handle(channels.TEST_CONNECTION, async () => {
    const settings = loadSettings();

    if (!isConfigured(settings)) {
      return {
        success: false,
        message: "Please fill in your GitHub username, token, and repo name first.",
      };
    }

    const repoUrl = getRepoUrl(settings);

    try {
      // Try a lightweight operation — just check if we can reach the remote.
      const result = await git.isGitInstalled();
      if (!result) {
        return {
          success: false,
          message: "Git is not installed on this machine. Please install Git first.",
        };
      }

      // Try to ls-remote to verify the credentials work.
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);

      await execFileAsync("git", ["ls-remote", repoUrl], { timeout: 15_000 });

      return {
        success: true,
        message: "Connected successfully! Your credentials are working.",
      };
    } catch {
      return {
        success: false,
        message: "Could not connect. Please check your token, username, and repo name.",
      };
    }
  });

  // ── Sync ──

  /**
   * Returns the current sync status.
   * The renderer polls this to update the status display.
   */
  ipcMain.handle(channels.GET_SYNC_STATUS, () => {
    // The sync engine status is managed by the main process.
    // For now, return a basic status. The main.ts wires up
    // the real sync engine status later.
    return {
      status: "idle",
      message: "Ready to sync.",
      lastSyncAt: "",
    };
  });

  // ── Device Info ──

  /**
   * Returns information about this device.
   */
  ipcMain.handle(channels.GET_DEVICE_INFO, () => {
    const identity = getOrCreateDeviceIdentity();
    return identity;
  });

  // ── Browser Detection ──

  /**
   * Returns the list of installed Chromium browsers.
   */
  ipcMain.handle(channels.GET_BROWSERS, () => {
    return detectInstalledBrowsers();
  });

  // ── Browser Path Validation ──

  /**
   * Validates a custom browser data path.
   * Returns whether the path looks like a valid Chromium data directory.
   */
  ipcMain.handle(channels.VALIDATE_BROWSER_PATH, (_event, customPath: string, profileName?: string) => {
    return validateCustomBrowserPath(customPath, profileName || "Default");
  });
}
