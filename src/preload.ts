// Secure bridge between renderer and main process.
// The renderer can ONLY call functions exposed here via window.synkromium.

import { contextBridge, ipcRenderer } from "electron";
import * as channels from "./ipc/channels.js";

contextBridge.exposeInMainWorld("synkromium", {
  getSettings: () =>
    ipcRenderer.invoke(channels.GET_SETTINGS),

  saveSettings: (settings: Record<string, unknown>) =>
    ipcRenderer.invoke(channels.SAVE_SETTINGS, settings),

  testConnection: () =>
    ipcRenderer.invoke(channels.TEST_CONNECTION),

  startOAuth: () =>
    ipcRenderer.invoke(channels.GITHUB_OAUTH_START),

  onOAuthStatus: (callback: (payload: Record<string, unknown>) => void) => {
    ipcRenderer.on(channels.GITHUB_OAUTH_STATUS, (_event, payload) => {
      callback(payload as Record<string, unknown>);
    });
  },

  syncNow: () =>
    ipcRenderer.invoke(channels.SYNC_NOW),

  getSyncStatus: () =>
    ipcRenderer.invoke(channels.GET_SYNC_STATUS),

  getDeviceInfo: () =>
    ipcRenderer.invoke(channels.GET_DEVICE_INFO),

  getInstalledBrowsers: () =>
    ipcRenderer.invoke(channels.GET_BROWSERS),

  validateBrowserPath: (customPath: string, profileName?: string) =>
    ipcRenderer.invoke(channels.VALIDATE_BROWSER_PATH, customPath, profileName),

  onSyncStatusChanged: (callback: (status: string, message: string) => void) => {
    ipcRenderer.on(channels.SYNC_STATUS_CHANGED, (_event, status, message) => {
      callback(status as string, message as string);
    });
  },
});

