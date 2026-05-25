import { ipcMain, shell, BrowserWindow } from "electron";
import { loadSettings, saveSettings, getRepoUrl, isConfigured, type UserSettings } from "../config/settings.js";
import { getOrCreateDeviceIdentity } from "../device/identity.js";
import { detectInstalledBrowsers, validateCustomBrowserPath } from "../adapters/chromium/paths.js";
import { startDeviceFlow, pollForToken, fetchGitHubUser } from "../auth/github-oauth.js";
import * as git from "../git/backend.js";
import * as channels from "./channels.js";
import { logger } from "../utils/logger.js";

let oauthAbortController: AbortController | null = null;

export function registerIpcHandlers(): void {
  ipcMain.handle(channels.GET_SETTINGS, () => {
    const settings = loadSettings();
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

      try {
        await execFileAsync("git", ["ls-remote", repoUrl], { timeout: 15_000 });
      } catch (error: any) {
        const stderr = error.stderr || error.message || "";
        if (stderr.includes("not found") || stderr.includes("Repository not found")) {
           logger.info("Repository not found, attempting to create it...");
           const { createGitHubRepo } = await import("../auth/github-oauth.js");
           await createGitHubRepo(settings.githubToken, settings.repoName);
           // Verify again
           await execFileAsync("git", ["ls-remote", repoUrl], { timeout: 15_000 });
        } else {
           throw error;
        }
      }

      return {
        success: true,
        message: "Connected successfully! Your credentials are working.",
      };
    } catch (error) {
      logger.error("Connection test failed:", error);
      return {
        success: false,
        message: "Could not connect. Please check your token, username, and repo name.",
      };
    }
  });

  ipcMain.handle(channels.GITHUB_OAUTH_START, async (event) => {
    logger.info("Handling GITHUB_OAUTH_START IPC call...");
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;

    const sendStatus = (payload: Record<string, unknown>) => {
      if (!window.isDestroyed()) {
        window.webContents.send(channels.GITHUB_OAUTH_STATUS, payload);
      }
    };

    if (oauthAbortController) {
      logger.info("Aborting previous OAuth flow.");
      oauthAbortController.abort();
    }
    oauthAbortController = new AbortController();

    try {
      const deviceResponse = await startDeviceFlow();

      sendStatus({
        phase: "awaiting_user",
        userCode: deviceResponse.user_code,
        verificationUri: deviceResponse.verification_uri,
      });

      await shell.openExternal(deviceResponse.verification_uri);

      const tokenResult = await pollForToken(
        deviceResponse.device_code,
        deviceResponse.interval,
        deviceResponse.expires_in,
        oauthAbortController.signal,
      );

      sendStatus({ phase: "fetching_user" });

      const user = await fetchGitHubUser(tokenResult.access_token);

      const current = loadSettings();
      const updated = {
        ...current,
        githubToken: tokenResult.access_token,
        githubUsername: user.login,
      };
      saveSettings(updated);

      logger.info(`OAuth flow completed successfully for user ${user.login}`);
      sendStatus({
        phase: "success",
        username: user.login,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "OAuth flow failed.";
      logger.error("OAuth flow failed in IPC handler:", error);
      sendStatus({ phase: "error", message });
    } finally {
      oauthAbortController = null;
    }
  });

  ipcMain.handle(channels.GET_SYNC_STATUS, async () => {
    try {
      const engine = await getSyncEngine();
      return {
        status: engine.getStatus(),
        message: "Engine running.",
        lastSyncAt: new Date().toISOString(), // We should read this from state, but this is a stub
      };
    } catch {
      return {
        status: "idle",
        message: "Ready to sync.",
        lastSyncAt: "",
      };
    }
  });

  ipcMain.handle(channels.SYNC_NOW, async () => {
    try {
      logger.info("Handling SYNC_NOW IPC call...");
      
      const settings = loadSettings();
      if (!isConfigured(settings)) {
        throw new Error("Synkromium is not configured yet.");
      }
      
      // Auto-create repo if it doesn't exist
      const { createGitHubRepo } = await import("../auth/github-oauth.js");
      await createGitHubRepo(settings.githubToken, settings.repoName).catch((e) => {
        logger.warn("Auto-create repo error (might already exist):", e.message);
      });

      const engine = await getSyncEngine();
      await engine.syncNow();
    } catch (error: any) {
      logger.error("Sync Now failed:", error);
      throw error;
    }
  });

  ipcMain.handle(channels.SYNC_PUSH, async () => {
    try {
      logger.info("Handling SYNC_PUSH IPC call...");
      
      const settings = loadSettings();
      if (!isConfigured(settings)) {
        throw new Error("Synkromium is not configured yet.");
      }
      
      const { createGitHubRepo } = await import("../auth/github-oauth.js");
      await createGitHubRepo(settings.githubToken, settings.repoName).catch((e) => {
        logger.warn("Auto-create repo error (might already exist):", e.message);
      });

      const engine = await getSyncEngine();
      await engine.push();
    } catch (error: any) {
      logger.error("Sync Push failed:", error);
      throw error;
    }
  });

  ipcMain.handle(channels.SYNC_PULL, async () => {
    try {
      logger.info("Handling SYNC_PULL IPC call...");
      
      const settings = loadSettings();
      if (!isConfigured(settings)) {
        throw new Error("Synkromium is not configured yet.");
      }
      
      const engine = await getSyncEngine();
      await engine.pull();
    } catch (error: any) {
      logger.error("Sync Pull failed:", error);
      throw error;
    }
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

let syncEngineInstance: any = null;

async function getSyncEngine() {
  if (syncEngineInstance) return syncEngineInstance;

  const settings = loadSettings();
  if (!isConfigured(settings)) {
    throw new Error("Synkromium is not configured yet.");
  }

  const { SyncEngine } = await import("../sync/engine.js");
  const { ChromiumAdapter } = await import("../adapters/chromium/adapter.js");
  const { join } = await import("node:path");
  const { app } = await import("electron");
  const { SYNC_REPO_NAME } = await import("../config/constants.js");
  
  const REPO_PATH = join(app.getPath("userData"), SYNC_REPO_NAME);
  
  const adapter = new ChromiumAdapter(
    (settings.browser || "chrome") as any,
    settings.profileName,
    settings.customBrowserPath
  );

  syncEngineInstance = new SyncEngine({
    repoPath: REPO_PATH,
    adapter: adapter,
    remoteUrl: getRepoUrl(settings),
  });

  // Start the engine
  await syncEngineInstance.start();

  return syncEngineInstance;
}

