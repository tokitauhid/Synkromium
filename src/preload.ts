/**
 * preload.ts — The secure bridge between worlds.
 *
 * Electron's security model keeps the renderer (UI) isolated from
 * Node.js. This preload script is the ONE place where we expose
 * specific, controlled functions to the renderer.
 *
 * The renderer can ONLY call the functions defined here.
 * It cannot access the filesystem, run commands, or do anything
 * dangerous directly. Everything goes through IPC.
 *
 * Think of this as a reception desk: the renderer can ask questions
 * and make requests, but it can't walk into the back office.
 */

import { contextBridge, ipcRenderer } from "electron";
import * as channels from "./ipc/channels.js";

/**
 * This object is exposed to the renderer as `window.synkromium`.
 *
 * In the renderer (app.ts), you call things like:
 *   const settings = await window.synkromium.getSettings();
 *   await window.synkromium.saveSettings({ browser: "brave" });
 */
contextBridge.exposeInMainWorld("synkromium", {
  // ── Settings ──
  getSettings: () =>
    ipcRenderer.invoke(channels.GET_SETTINGS),

  saveSettings: (settings: Record<string, unknown>) =>
    ipcRenderer.invoke(channels.SAVE_SETTINGS, settings),

  testConnection: () =>
    ipcRenderer.invoke(channels.TEST_CONNECTION),

  // ── Sync ──
  syncNow: () =>
    ipcRenderer.invoke(channels.SYNC_NOW),

  getSyncStatus: () =>
    ipcRenderer.invoke(channels.GET_SYNC_STATUS),

  // ── Device ──
  getDeviceInfo: () =>
    ipcRenderer.invoke(channels.GET_DEVICE_INFO),

  // ── Browsers ──
  getInstalledBrowsers: () =>
    ipcRenderer.invoke(channels.GET_BROWSERS),

  validateBrowserPath: (customPath: string, profileName?: string) =>
    ipcRenderer.invoke(channels.VALIDATE_BROWSER_PATH, customPath, profileName),

  // ── Status Updates (Main → Renderer) ──
  onSyncStatusChanged: (callback: (status: string, message: string) => void) => {
    ipcRenderer.on(channels.SYNC_STATUS_CHANGED, (_event, status, message) => {
      callback(status as string, message as string);
    });
  },
});
