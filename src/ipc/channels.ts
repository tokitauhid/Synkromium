/**
 * channels.ts — The vocabulary for main ↔ renderer communication.
 *
 * Electron separates the app into two worlds:
 * - Main process: has full access to Node.js, Git, filesystem, etc.
 * - Renderer process: runs the UI in a browser-like sandbox.
 *
 * They talk to each other through "IPC channels" — named messages.
 * This file defines all the channel names in one place so both
 * sides always agree on what to call things.
 *
 * Think of it like a walkie-talkie: both sides need to be on
 * the same channel to hear each other.
 */

// ─── Settings Channels ──────────────────────────────────────────
// The renderer asks the main process to read/write user settings.

/** Renderer → Main: "Give me the current settings." */
export const GET_SETTINGS = "settings:get";

/** Renderer → Main: "Save these updated settings." */
export const SAVE_SETTINGS = "settings:save";

/** Renderer → Main: "Test if the GitHub connection works." */
export const TEST_CONNECTION = "github:test-connection";

// ─── Sync Channels ──────────────────────────────────────────────
// The renderer can trigger syncs and get status updates.

/** Renderer → Main: "Sync now, please." */
export const SYNC_NOW = "sync:now";

/** Renderer → Main: "What's the current sync status?" */
export const GET_SYNC_STATUS = "sync:get-status";

/** Main → Renderer: "The sync status just changed." */
export const SYNC_STATUS_CHANGED = "sync:status-changed";

// ─── Device Channels ────────────────────────────────────────────

/** Renderer → Main: "Tell me about this device." */
export const GET_DEVICE_INFO = "device:get-info";

// ─── Browser Channels ───────────────────────────────────────────

/** Renderer → Main: "Which browsers are installed?" */
export const GET_BROWSERS = "browser:get-installed";
