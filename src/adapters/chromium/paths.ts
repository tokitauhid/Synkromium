/**
 * paths.ts — "Where does Chrome keep its stuff?"
 *
 * Chrome (and all Chromium-based browsers) store settings in
 * different folders depending on your OS:
 * - Linux:   ~/.config/google-chrome/Default/
 * - macOS:   ~/Library/Application Support/Google/Chrome/Default/
 * - Windows: %LOCALAPPDATA%\Google\Chrome\User Data\Default\
 *
 * This module figures out the right path for the current computer
 * so the rest of the code doesn't have to worry about it.
 *
 * It also supports Brave, Edge, and Chromium — they all use the
 * same settings format, just in different directories.
 */

import { join } from "node:path";
import { existsSync } from "node:fs";
import { platform, homedir } from "node:os";

// ─── Supported Browsers ─────────────────────────────────────────

/**
 * Every Chromium-based browser we know how to find.
 * The key is a friendly name, the value has paths for each OS.
 */
export type BrowserName = "chrome" | "chromium" | "brave" | "edge";

interface BrowserPaths {
  linux: string;
  darwin: string;  // macOS
  win32: string;   // Windows
}

/**
 * Where each browser keeps its user data on each platform.
 * These are the DEFAULT profile paths — if the user has a custom
 * profile, they'll need to configure it manually (for now).
 */
const BROWSER_DATA_PATHS: Record<BrowserName, BrowserPaths> = {
  chrome: {
    linux: ".config/google-chrome",
    darwin: "Library/Application Support/Google/Chrome",
    win32: "Google/Chrome/User Data",
  },
  chromium: {
    linux: ".config/chromium",
    darwin: "Library/Application Support/Chromium",
    win32: "Chromium/User Data",
  },
  brave: {
    linux: ".config/BraveSoftware/Brave-Browser",
    darwin: "Library/Application Support/BraveSoftware/Brave-Browser",
    win32: "BraveSoftware/Brave-Browser/User Data",
  },
  edge: {
    linux: ".config/microsoft-edge",
    darwin: "Library/Application Support/Microsoft Edge",
    win32: "Microsoft/Edge/User Data",
  },
};

/**
 * The files inside a Chrome profile that contain the settings
 * we care about. These are the ones the adapter reads and writes.
 */
const SETTINGS_FILES = [
  "Preferences",          // Main settings (homepage, search engine, UI prefs)
  "Secure Preferences",   // Protected settings (extensions, security prefs)
  "Bookmarks",            // User bookmarks
];

// ─── Path Resolution ────────────────────────────────────────────

/**
 * Gets the base data directory for a specific browser on this OS.
 *
 * On Linux, this is something like: /home/tokit/.config/google-chrome
 * On macOS: /Users/tokit/Library/Application Support/Google/Chrome
 * On Windows: C:\Users\tokit\AppData\Local\Google\Chrome\User Data
 */
export function getBrowserDataPath(browser: BrowserName): string | null {
  const currentPlatform = platform();
  const home = homedir();
  const paths = BROWSER_DATA_PATHS[browser];

  let basePath: string;

  if (currentPlatform === "linux") {
    basePath = join(home, paths.linux);
  } else if (currentPlatform === "darwin") {
    basePath = join(home, paths.darwin);
  } else if (currentPlatform === "win32") {
    // On Windows, Chrome uses LOCALAPPDATA, not the home directory.
    const localAppData = process.env["LOCALAPPDATA"] || join(home, "AppData", "Local");
    basePath = join(localAppData, paths.win32);
  } else {
    // Unknown OS — we can't guess where Chrome keeps its data.
    return null;
  }

  return basePath;
}

/**
 * Gets the full path to the "Default" profile directory.
 *
 * Chrome organizes settings by profile. Most people use the
 * "Default" profile (even if they don't know it). Multi-profile
 * support can come later.
 */
export function getProfilePath(browser: BrowserName, profileName: string = "Default"): string | null {
  const dataPath = getBrowserDataPath(browser);

  if (!dataPath) {
    return null;
  }

  return join(dataPath, profileName);
}

/**
 * Gets the full paths to all the settings files we want to sync.
 *
 * Returns only the files that actually exist on this computer.
 * If Chrome isn't installed, this returns an empty list — no crash.
 *
 * Example:
 *   getSettingsFilePaths("chrome")
 *   → ["/home/tokit/.config/google-chrome/Default/Preferences",
 *      "/home/tokit/.config/google-chrome/Default/Bookmarks"]
 */
export function getSettingsFilePaths(browser: BrowserName, profileName: string = "Default"): string[] {
  const profilePath = getProfilePath(browser, profileName);

  if (!profilePath) {
    return [];
  }

  // Only return files that actually exist on this machine.
  return SETTINGS_FILES
    .map((fileName) => join(profilePath, fileName))
    .filter((fullPath) => existsSync(fullPath));
}

/**
 * Auto-detects which Chromium browsers are installed on this machine.
 *
 * Checks each known browser's data directory. If the directory
 * exists, we assume the browser is installed.
 *
 * Example:
 *   detectInstalledBrowsers()
 *   → ["chrome", "brave"]  // Only Chrome and Brave are installed.
 */
export function detectInstalledBrowsers(): BrowserName[] {
  const installed: BrowserName[] = [];
  const allBrowsers: BrowserName[] = ["chrome", "chromium", "brave", "edge"];

  for (const browser of allBrowsers) {
    const dataPath = getBrowserDataPath(browser);
    if (dataPath && existsSync(dataPath)) {
      installed.push(browser);
    }
  }

  return installed;
}

/**
 * Returns the list of settings file names (not full paths).
 * Used by the allowlist to know what filenames to approve.
 */
export function getSettingsFileNames(): string[] {
  return [...SETTINGS_FILES];
}
