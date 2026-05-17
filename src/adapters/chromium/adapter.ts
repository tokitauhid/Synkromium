import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { join, basename } from "node:path";
import type { Adapter, NormalizedState, ValidationResult } from "../base.js";
import { getSettingsFilePaths, getProfilePath, type BrowserName } from "./paths.js";
import { extractExtensions } from "./extensions.js";

// Keys that are machine-specific (local paths, GPU info, session state)
// and should never travel between devices
const MACHINE_SPECIFIC_KEYS = [
  "download.default_directory",
  "download.prompt_for_download",
  "profile.info_cache",
  "profile.last_used",
  "hardware_acceleration_mode",
  "local_state",
  "os_crypt",
  "uninstall_metrics",
];

export class ChromiumAdapter implements Adapter {
  private browser: BrowserName;
  private profileName: string;
  private customBrowserPath: string;

  constructor(
    browser: BrowserName = "chrome",
    profileName: string = "Default",
    customBrowserPath: string = ""
  ) {
    this.browser = browser;
    this.profileName = profileName;
    this.customBrowserPath = customBrowserPath;
  }

  async extract(): Promise<NormalizedState> {
    const settingsFiles = getSettingsFilePaths(this.browser, this.profileName, this.customBrowserPath || undefined);
    const settingsData: Record<string, unknown> = {};

    for (const filePath of settingsFiles) {
      const fileName = basename(filePath);
      try {
        const raw = readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        settingsData[fileName] = this.stripMachineSpecificKeys(parsed);
      } catch {
        console.warn(`[Synkromium] Could not read ${fileName}. Skipping.`);
      }
    }

    const profilePath = getProfilePath(this.browser, this.profileName, this.customBrowserPath || undefined);
    if (profilePath) {
      settingsData["extensions"] = extractExtensions(profilePath);
    }

    return {
      adapterId: this.getId(),
      schemaVersion: this.getSchemaVersion(),
      extractedAt: new Date().toISOString(),
      deviceId: "",
      data: settingsData,
    };
  }

  async restore(state: NormalizedState): Promise<void> {
    const profilePath = getProfilePath(this.browser, this.profileName, this.customBrowserPath || undefined);

    if (!profilePath) {
      throw new Error(
        `Cannot find ${this.browser} profile "${this.profileName}" on this machine. Is the browser installed?`
      );
    }

    for (const [fileName, incomingData] of Object.entries(state.data)) {
      if (fileName === "extensions") continue;

      const filePath = join(profilePath, fileName);

      this.backupFile(filePath);

      let localSettings: Record<string, unknown> = {};
      if (existsSync(filePath)) {
        try {
          localSettings = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
        } catch {
          console.warn(`[Synkromium] Local ${fileName} was corrupt. Using incoming settings entirely.`);
        }
      }

      // Merge: use incoming settings but preserve local machine-specific keys
      const merged = this.mergeSettings(localSettings, incomingData as Record<string, unknown>);
      writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf-8");
    }
  }

  async validate(state: NormalizedState): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!state.data || typeof state.data !== "object") {
      errors.push("Settings data is missing or not an object.");
    }

    if (state.adapterId !== this.getId()) {
      errors.push(`Adapter mismatch: expected "${this.getId()}" but got "${state.adapterId}".`);
    }

    if (state.schemaVersion > this.getSchemaVersion()) {
      errors.push(
        `Schema version ${state.schemaVersion} is newer than supported (${this.getSchemaVersion()}). Please update Synkromium.`
      );
    }

    if (Object.keys(state.data).length === 0) {
      errors.push("Settings data is empty. Nothing to sync.");
    }

    return { valid: errors.length === 0, errors };
  }

  getSyncPaths(): string[] {
    return getSettingsFilePaths(this.browser, this.profileName, this.customBrowserPath || undefined);
  }

  getId(): string {
    return "chromium";
  }

  getSchemaVersion(): number {
    return 1;
  }

  private stripMachineSpecificKeys(settings: Record<string, unknown>): Record<string, unknown> {
    const cleaned = { ...settings };
    for (const key of MACHINE_SPECIFIC_KEYS) delete cleaned[key];
    return cleaned;
  }

  /** Incoming (remote) settings win, except for machine-specific keys which stay local. */
  private mergeSettings(
    local: Record<string, unknown>,
    incoming: Record<string, unknown>
  ): Record<string, unknown> {
    const merged = { ...incoming };
    for (const key of MACHINE_SPECIFIC_KEYS) {
      if (key in local) merged[key] = local[key];
    }
    return merged;
  }

  private backupFile(filePath: string): void {
    if (!existsSync(filePath)) return;
    try {
      copyFileSync(filePath, filePath + ".synkromium-bak");
    } catch {
      console.warn(`[Synkromium] Could not create backup of ${basename(filePath)}.`);
    }
  }
}
