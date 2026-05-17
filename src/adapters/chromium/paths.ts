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
 * It also supports Brave, Edge, Chromium, and Helium — they all
 * use the same settings format, just in different directories.
 *
 * Users can also manually specify a custom browser data path
 * for browsers installed in non-standard locations.
 */

import { join } from "node:path";
import { existsSync } from "node:fs";
import { platform, homedir } from "node:os";

// ─── Supported Browsers ─────────────────────────────────────────

/**
 * Every Chromium-based browser we know how to find.
 * The key is a friendly name, the value has paths for each OS.
 */
export type BrowserName = "chrome" | "chromium" | "brave" | "edge" | "helium";

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
  helium: {
    linux: ".config/net.imput.helium",
    darwin: "Library/Application Support/net.imput.helium",
    win32: "imput/Helium",
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
 *
 * If a customPath is provided, it is used directly instead of
 * looking up the default path. This lets users point to browsers
 * installed in non-standard locations.
 */
export function getBrowserDataPath(browser: BrowserName, customPath?: string): string | null {
  // If the user has set a custom path, use it directly.
  if (customPath && customPath.trim() !== "") {
    return customPath.trim();
  }

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
export function getProfilePath(browser: BrowserName, profileName: string = "Default", customPath?: string): string | null {
  const dataPath = getBrowserDataPath(browser, customPath);

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
export function getSettingsFilePaths(browser: BrowserName, profileName: string = "Default", customPath?: string): string[] {
  const profilePath = getProfilePath(browser, profileName, customPath);

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
  const allBrowsers: BrowserName[] = ["chrome", "chromium", "brave", "edge", "helium"];

  for (const browser of allBrowsers) {
    const dataPath = getBrowserDataPath(browser);
    if (dataPath && existsSync(dataPath)) {
      installed.push(browser);
    }
  }

  return installed;
}

/**
 * Validates that a custom browser data path looks correct.
 * Checks that the directory exists and contains a profile
 * subdirectory with recognizable Chromium settings files.
 *
 * Returns a result with a helpful message either way.
 */
export function validateCustomBrowserPath(
  customPath: string,
  profileName: string = "Default"
): { valid: boolean; message: string } {
  if (!customPath || customPath.trim() === "") {
    return { valid: false, message: "No path provided." };
  }

  const trimmed = customPath.trim();

  if (!existsSync(trimmed)) {
    return { valid: false, message: `Directory not found: ${trimmed}` };
  }

  const profilePath = join(trimmed, profileName);
  if (!existsSync(profilePath)) {
    return {
      valid: false,
      message: `Profile "${profileName}" not found in ${trimmed}. Available profiles may have different names.`,
    };
  }

  // Check for at least one recognizable Chromium settings file.
  const hasSettingsFile = SETTINGS_FILES.some((f) =>
    existsSync(join(profilePath, f))
  );

  if (!hasSettingsFile) {
    return {
      valid: false,
      message: `No Chromium settings files found in ${profilePath}. This may not be a Chromium-based browser data directory.`,
    };
  }

  return { valid: true, message: "Path looks correct — Chromium settings files found." };
}

/**
 * Returns the list of settings file names (not full paths).
 * Used by the allowlist to know what filenames to approve.
 */
export function getSettingsFileNames(): string[] {
  return [...SETTINGS_FILES];
}
