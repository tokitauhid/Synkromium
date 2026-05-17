import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { APP_NAME } from "./constants.js";

export interface UserSettings {
  githubToken: string;
  githubUsername: string;
  repoName: string;
  browser: "chrome" | "chromium" | "brave" | "edge" | "helium";
  profileName: string;
  syncOptions: {
    settings: boolean;
    extensions: boolean;
    bookmarks: boolean;
  };
  pollIntervalMinutes: number;
  autoSync: boolean;
  syncOnStartup: boolean;
  setupComplete: boolean;
  /** Overrides auto-detected browser data directory when set. */
  customBrowserPath: string;
}

function getDefaultSettings(): UserSettings {
  return {
    githubToken: "",
    githubUsername: "",
    repoName: "synkromium-data",
    browser: "chrome",
    profileName: "Default",
    syncOptions: {
      settings: true,
      extensions: true,
      bookmarks: true,
    },
    pollIntervalMinutes: 15,
    autoSync: true,
    syncOnStartup: true,
    setupComplete: false,
    customBrowserPath: "",
  };
}

function getConfigDir(): string {
  return join(homedir(), `.${APP_NAME.toLowerCase()}`);
}

function getSettingsPath(): string {
  return join(getConfigDir(), "settings.json");
}

export function loadSettings(): UserSettings {
  const filePath = getSettingsPath();
  const defaults = getDefaultSettings();

  if (!existsSync(filePath)) {
    return defaults;
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    const saved = JSON.parse(raw) as Partial<UserSettings>;
    // Merge with defaults so new settings added in future versions get their defaults
    return { ...defaults, ...saved };
  } catch {
    console.warn("[Synkromium] Settings file was corrupted. Using defaults.");
    return defaults;
  }
}

export function saveSettings(settings: UserSettings): void {
  const configDir = getConfigDir();
  const filePath = getSettingsPath();

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  writeFileSync(filePath, JSON.stringify(settings, null, 2), "utf-8");
}

export function updateSettings(partial: Partial<UserSettings>): UserSettings {
  const current = loadSettings();
  const updated = { ...current, ...partial };
  saveSettings(updated);
  return updated;
}

/** Embeds token in URL for non-interactive git auth. */
export function getRepoUrl(settings: UserSettings): string {
  if (!settings.githubToken || !settings.githubUsername || !settings.repoName) {
    return "";
  }
  return `https://${settings.githubToken}@github.com/${settings.githubUsername}/${settings.repoName}.git`;
}

export function isConfigured(settings: UserSettings): boolean {
  return Boolean(settings.githubToken && settings.githubUsername && settings.repoName);
}
