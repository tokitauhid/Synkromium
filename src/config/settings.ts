/**
 * settings.ts — Where user preferences live.
 *
 * This module handles reading and writing the user's configuration:
 * - GitHub credentials (PAT token, repo name, username)
 * - Which browser to sync
 * - What to sync (settings, extensions, bookmarks)
 * - Sync timing and behavior
 *
 * Settings are stored as a plain JSON file in the user's home
 * directory. Nothing clever — you can open it in any text editor.
 *
 * IMPORTANT: The GitHub token is stored here in plaintext for MVP.
 * A production version should use the OS keychain (via keytar).
 * For now, we keep it simple and document the trade-off.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { APP_NAME } from "./constants.js";

// ─── Types ──────────────────────────────────────────────────────

/** Everything the user can configure. */
export interface UserSettings {
  /** GitHub Personal Access Token for pushing/pulling the sync repo. */
  githubToken: string;

  /** GitHub username (used to construct the repo URL). */
  githubUsername: string;

  /** The name of the private repo to store synced data in. */
  repoName: string;

  /** Which Chromium browser to sync: "chrome", "brave", "edge", or "chromium". */
  browser: "chrome" | "chromium" | "brave" | "edge";

  /** Which Chrome profile to sync (most people use "Default"). */
  profileName: string;

  /** What types of data to include in the sync. */
  syncOptions: {
    settings: boolean;
    extensions: boolean;
    bookmarks: boolean;
  };

  /** How often to poll for remote changes (in minutes). */
  pollIntervalMinutes: number;

  /** Automatically sync when a file change is detected? */
  autoSync: boolean;

  /** Pull remote changes on app startup? */
  syncOnStartup: boolean;

  /** Has the user completed the first-run setup? */
  setupComplete: boolean;
}

// ─── Defaults ───────────────────────────────────────────────────

/**
 * Sensible defaults for a fresh install.
 * The user can change any of these through the settings UI.
 */
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
  };
}

// ─── File Paths ─────────────────────────────────────────────────

/** The directory where Synkromium stores its config. */
function getConfigDir(): string {
  return join(homedir(), `.${APP_NAME.toLowerCase()}`);
}

/** The full path to the settings file. */
function getSettingsPath(): string {
  return join(getConfigDir(), "settings.json");
}

// ─── Reading and Writing ────────────────────────────────────────

/**
 * Loads the user's settings from disk.
 * If no settings file exists yet, returns sensible defaults.
 * If the file is corrupted, returns defaults (and logs a warning).
 */
export function loadSettings(): UserSettings {
  const filePath = getSettingsPath();
  const defaults = getDefaultSettings();

  if (!existsSync(filePath)) {
    return defaults;
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    const saved = JSON.parse(raw) as Partial<UserSettings>;

    // Merge saved settings with defaults so any NEW settings
    // added in a future version get their default values.
    return { ...defaults, ...saved };
  } catch {
    console.warn("[Synkromium] Settings file was corrupted. Using defaults.");
    return defaults;
  }
}

/**
 * Saves the user's settings to disk.
 * Creates the config directory if it doesn't exist yet.
 */
export function saveSettings(settings: UserSettings): void {
  const configDir = getConfigDir();
  const filePath = getSettingsPath();

  // Make sure the config directory exists.
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const prettyJson = JSON.stringify(settings, null, 2);
  writeFileSync(filePath, prettyJson, "utf-8");
}

/**
 * Updates specific fields without overwriting the rest.
 * This is what the UI calls when the user changes one setting.
 */
export function updateSettings(partial: Partial<UserSettings>): UserSettings {
  const current = loadSettings();
  const updated = { ...current, ...partial };
  saveSettings(updated);
  return updated;
}

/**
 * Constructs the full GitHub repo URL from the user's settings.
 * Used by the Git backend to know where to push/pull.
 *
 * We embed the token in the URL so Git can authenticate without
 * interactive prompts. This is standard for automated tools.
 */
export function getRepoUrl(settings: UserSettings): string {
  if (!settings.githubToken || !settings.githubUsername || !settings.repoName) {
    return "";
  }

  return `https://${settings.githubToken}@github.com/${settings.githubUsername}/${settings.repoName}.git`;
}

/**
 * Quick check: has the user provided enough info to start syncing?
 */
export function isConfigured(settings: UserSettings): boolean {
  return Boolean(settings.githubToken && settings.githubUsername && settings.repoName);
}
