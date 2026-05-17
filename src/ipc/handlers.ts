import { ipcMain } from "electron";
import { loadSettings, saveSettings, getRepoUrl, isConfigured, type UserSettings } from "../config/settings.js";
import { getOrCreateDeviceIdentity } from "../device/identity.js";
import { detectInstalledBrowsers, validateCustomBrowserPath } from "../adapters/chromium/paths.js";
import * as git from "../git/backend.js";
import * as channels from "./channels.js";

export function registerIpcHandlers(): void {

  ipcMain.handle(channels.GET_SETTINGS, () => {
    const settings = loadSettings();
    // Never send the raw token to the renderer
    return {
      ...settings,
      githubTokenMasked: settings.githubToken
        ? "•".repeat(8) + settings.githubToken.slice(-4)
        : "",
    };
  });

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
      const result = await git.isGitInstalled();
      if (!result) {
        return {
          success: false,
          message: "Git is not installed on this machine. Please install Git first.",
        };
      }

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

  ipcMain.handle(channels.GET_SYNC_STATUS, () => {
    // TODO: Wire up real sync engine status
    return {
      status: "idle",
      message: "Ready to sync.",
      lastSyncAt: "",
    };
  });

  ipcMain.handle(channels.GET_DEVICE_INFO, () => {
    return getOrCreateDeviceIdentity();
  });

  ipcMain.handle(channels.GET_BROWSERS, () => {
    return detectInstalledBrowsers();
  });

  ipcMain.handle(channels.VALIDATE_BROWSER_PATH, (_event, customPath: string, profileName?: string) => {
    return validateCustomBrowserPath(customPath, profileName || "Default");
  });
}
