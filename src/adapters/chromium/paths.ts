import { join } from "node:path";
import { existsSync } from "node:fs";
import { platform, homedir } from "node:os";

export type BrowserName = "chrome" | "chromium" | "brave" | "edge" | "helium";

interface BrowserPaths {
  linux: string;
  darwin: string;
  win32: string;
}

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

const SETTINGS_FILES = [
  "Preferences",
  "Secure Preferences",
  "Bookmarks",
];

/** Returns the browser's data directory, or the custom path if provided. */
export function getBrowserDataPath(browser: BrowserName, customPath?: string): string | null {
  if (customPath && customPath.trim() !== "") {
    return customPath.trim();
  }

  const currentPlatform = platform();
  const home = homedir();
  const paths = BROWSER_DATA_PATHS[browser];

  if (currentPlatform === "linux") {
    return join(home, paths.linux);
  } else if (currentPlatform === "darwin") {
    return join(home, paths.darwin);
  } else if (currentPlatform === "win32") {
    const localAppData = process.env["LOCALAPPDATA"] || join(home, "AppData", "Local");
    return join(localAppData, paths.win32);
  }

  return null;
}

export function getProfilePath(browser: BrowserName, profileName: string = "Default", customPath?: string): string | null {
  const dataPath = getBrowserDataPath(browser, customPath);
  if (!dataPath) return null;
  return join(dataPath, profileName);
}

/** Returns full paths to settings files that actually exist on this machine. */
export function getSettingsFilePaths(browser: BrowserName, profileName: string = "Default", customPath?: string): string[] {
  const profilePath = getProfilePath(browser, profileName, customPath);
  if (!profilePath) return [];

  return SETTINGS_FILES
    .map((fileName) => join(profilePath, fileName))
    .filter((fullPath) => existsSync(fullPath));
}

/** Checks which known Chromium browsers have their data directory present. */
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

/** Validates that a custom path points to a real Chromium data directory. */
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
