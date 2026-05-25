import { app, safeStorage } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../utils/logger.js";

const ENCRYPTION_PREFIX = "enc:";

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
  return app.getPath("userData");
}

function getSettingsPath(): string {
  return join(getConfigDir(), "settings.json");
}

function canUseSafeStorage(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encryptToken(plaintext: string): string {
  if (!plaintext || !canUseSafeStorage()) return plaintext;
  try {
    const encrypted = safeStorage.encryptString(plaintext);
    return ENCRYPTION_PREFIX + encrypted.toString("base64");
  } catch (err) {
    logger.warn("Failed to encrypt token, storing as plaintext:", err);
    return plaintext;
  }
}

function decryptToken(stored: string): string {
  if (!stored || !stored.startsWith(ENCRYPTION_PREFIX)) return stored;
  if (!canUseSafeStorage()) {
    logger.warn("Token is encrypted but safeStorage is unavailable. Returning empty.");
    return "";
  }
  try {
    const base64 = stored.slice(ENCRYPTION_PREFIX.length);
    const buffer = Buffer.from(base64, "base64");
    return safeStorage.decryptString(buffer);
  } catch (err) {
    logger.warn("Failed to decrypt token:", err);
    return "";
  }
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
    const merged = { ...defaults, ...saved };

    // Decrypt token if encrypted
    if (merged.githubToken && merged.githubToken.startsWith(ENCRYPTION_PREFIX)) {
      merged.githubToken = decryptToken(merged.githubToken);
    } else if (merged.githubToken && canUseSafeStorage()) {
      // Migration: plaintext token found → encrypt and save back
      logger.info("Migrating plaintext token to OS keychain.");
      const encrypted = encryptToken(merged.githubToken);
      const onDisk = { ...defaults, ...saved, githubToken: encrypted };
      writeFileSync(filePath, JSON.stringify(onDisk, null, 2), "utf-8");
    }

    return merged;
  } catch {
    logger.warn("Settings file was corrupted. Using defaults.");
    return defaults;
  }
}

export function saveSettings(settings: UserSettings): void {
  const configDir = getConfigDir();
  const filePath = getSettingsPath();

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Encrypt token before writing to disk
  const toWrite = { ...settings };
  if (toWrite.githubToken && !toWrite.githubToken.startsWith(ENCRYPTION_PREFIX)) {
    toWrite.githubToken = encryptToken(toWrite.githubToken);
  }

  writeFileSync(filePath, JSON.stringify(toWrite, null, 2), "utf-8");
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
