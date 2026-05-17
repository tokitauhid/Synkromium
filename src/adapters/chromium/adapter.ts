/**
 * adapter.ts — The Chromium browser translator.
 *
 * This is the heart of Synkromium's first (and primary) adapter.
 * It knows how to:
 *   1. Read Chrome/Brave/Edge settings files
 *   2. Clean them up into a safe, portable format
 *   3. Write settings back without breaking the browser
 *
 * It follows the rules defined in base.ts (the Adapter interface).
 *
 * The adapter only touches files on the allowlist. It strips out
 * machine-specific data (like local file paths and hardware info)
 * so that settings travel cleanly between different computers.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { join, basename } from "node:path";
import type { Adapter, NormalizedState, ValidationResult } from "../base.js";
import { getSettingsFilePaths, getProfilePath, type BrowserName } from "./paths.js";
import { extractExtensions } from "./extensions.js";

// ─── Settings We Intentionally Skip ─────────────────────────────

/**
 * These keys inside Preferences are machine-specific — they refer
 * to local paths, hardware details, or session state that would
 * be meaningless (or harmful) on another computer.
 *
 * We strip them out during extract() and leave them untouched
 * during restore(). Your other machine keeps its own values.
 */
const MACHINE_SPECIFIC_KEYS = [
  "download.default_directory",    // Local download folder path
  "download.prompt_for_download",  // Sometimes tied to local setup
  "profile.info_cache",            // Cached profile metadata
  "profile.last_used",             // Which profile was last active
  "hardware_acceleration_mode",    // Depends on this machine's GPU
  "local_state",                   // Session state — not portable
  "os_crypt",                      // OS-specific encryption data
  "uninstall_metrics",             // Install-specific tracking
];

// ─── The Chromium Adapter Class ─────────────────────────────────

export class ChromiumAdapter implements Adapter {
  private browser: BrowserName;
  private profileName: string;
  private customBrowserPath: string;

  /**
   * Creates a new Chromium adapter for a specific browser and profile.
   *
   * Defaults to Google Chrome's "Default" profile, which is what
   * most people use without even knowing it.
   *
   * If customBrowserPath is set, it overrides the auto-detected
   * browser data directory.
   */
  constructor(
    browser: BrowserName = "chrome",
    profileName: string = "Default",
    customBrowserPath: string = ""
  ) {
    this.browser = browser;
    this.profileName = profileName;
    this.customBrowserPath = customBrowserPath;
  }

  // ── extract() — Read settings from the browser ──

  /**
   * Reads the browser's settings files and packages them into
   * a clean, portable NormalizedState.
   *
   * What it does:
   * 1. Finds the settings files for this browser on this OS
   * 2. Reads each file as JSON
   * 3. Strips out machine-specific keys (local paths, GPU info, etc.)
   * 4. Reads the extension list separately (via extensions.ts)
   * 5. Bundles everything into a NormalizedState
   */
  async extract(): Promise<NormalizedState> {
    const settingsFiles = getSettingsFilePaths(this.browser, this.profileName, this.customBrowserPath || undefined);
    const settingsData: Record<string, unknown> = {};

    // Read each settings file and clean it up.
    for (const filePath of settingsFiles) {
      const fileName = basename(filePath);

      try {
        const raw = readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const cleaned = this.stripMachineSpecificKeys(parsed);
        settingsData[fileName] = cleaned;
      } catch {
        // If a file is unreadable or corrupt, skip it.
        // We don't want one broken file to block the entire sync.
        console.warn(`[Synkromium] Could not read ${fileName}. Skipping.`);
      }
    }

    // Grab the extension list separately.
    const profilePath = getProfilePath(this.browser, this.profileName, this.customBrowserPath || undefined);
    if (profilePath) {
      const extensions = extractExtensions(profilePath);
      settingsData["extensions"] = extensions;
    }

    // Package everything up in the universal format.
    return {
      adapterId: this.getId(),
      schemaVersion: this.getSchemaVersion(),
      extractedAt: new Date().toISOString(),
      deviceId: "", // The sync engine fills this in.
      data: settingsData,
    };
  }

  // ── restore() — Apply settings to the browser ──

  /**
   * Takes a NormalizedState (from another device) and writes it
   * into the browser's settings files.
   *
   * What it does:
   * 1. Creates a backup of each current settings file (just in case)
   * 2. Merges the incoming settings with the existing ones
   *    (keeping machine-specific keys from the local copy)
   * 3. Writes the merged result back to disk
   *
   * IMPORTANT: The browser should be closed when this runs.
   * If Chrome is open, it might overwrite our changes when it exits.
   */
  async restore(state: NormalizedState): Promise<void> {
    const profilePath = getProfilePath(this.browser, this.profileName, this.customBrowserPath || undefined);

    if (!profilePath) {
      throw new Error(
        `Cannot find ${this.browser} profile "${this.profileName}" on this machine. ` +
        `Is the browser installed?`
      );
    }

    // Walk through each settings file in the incoming state.
    for (const [fileName, incomingData] of Object.entries(state.data)) {
      // Extensions are handled separately — skip them here.
      if (fileName === "extensions") continue;

      const filePath = join(profilePath, fileName);

      // Step 1: Back up the current file before we touch anything.
      this.backupFile(filePath);

      // Step 2: Read the current local settings (if they exist).
      let localSettings: Record<string, unknown> = {};
      if (existsSync(filePath)) {
        try {
          const raw = readFileSync(filePath, "utf-8");
          localSettings = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          // If the local file is corrupt, start fresh.
          console.warn(`[Synkromium] Local ${fileName} was corrupt. Using incoming settings entirely.`);
        }
      }

      // Step 3: Merge — use incoming settings, but keep local machine-specific keys.
      const merged = this.mergeSettings(localSettings, incomingData as Record<string, unknown>);

      // Step 4: Write the merged result back.
      const prettyJson = JSON.stringify(merged, null, 2);
      writeFileSync(filePath, prettyJson, "utf-8");
    }
  }

  // ── validate() — Check if settings are sane ──

  /**
   * Validates a NormalizedState to catch problems before they
   * get committed or applied.
   *
   * Checks:
   * - Is the data actually an object (not null/undefined/string)?
   * - Does it have the right adapter ID?
   * - Is the schema version something we understand?
   * - Is the data non-empty?
   */
  async validate(state: NormalizedState): Promise<ValidationResult> {
    const errors: string[] = [];

    // Basic sanity checks.
    if (!state.data || typeof state.data !== "object") {
      errors.push("Settings data is missing or not an object.");
    }

    if (state.adapterId !== this.getId()) {
      errors.push(
        `Adapter mismatch: expected "${this.getId()}" but got "${state.adapterId}". ` +
        `These settings might be from a different adapter.`
      );
    }

    if (state.schemaVersion > this.getSchemaVersion()) {
      errors.push(
        `Schema version ${state.schemaVersion} is newer than what we support (${this.getSchemaVersion()}). ` +
        `Please update Synkromium to apply these settings.`
      );
    }

    if (Object.keys(state.data).length === 0) {
      errors.push("Settings data is empty. Nothing to sync.");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ── Metadata ──

  getSyncPaths(): string[] {
    return getSettingsFilePaths(this.browser, this.profileName, this.customBrowserPath || undefined);
  }

  getId(): string {
    return "chromium";
  }

  getSchemaVersion(): number {
    return 1;
  }

  // ── Private Helpers ──

  /**
   * Removes machine-specific keys from a settings object.
   * These keys contain local paths, GPU info, etc. that would
   * be meaningless on another computer.
   */
  private stripMachineSpecificKeys(settings: Record<string, unknown>): Record<string, unknown> {
    const cleaned = { ...settings };

    for (const key of MACHINE_SPECIFIC_KEYS) {
      delete cleaned[key];
    }

    return cleaned;
  }

  /**
   * Merges incoming (remote) settings with local settings.
   *
   * The rule is simple:
   * - For machine-specific keys: keep the LOCAL value.
   * - For everything else: use the INCOMING (remote) value.
   *
   * This way, your font size and theme come from the sync,
   * but your download folder stays pointed at the right place
   * on this particular computer.
   */
  private mergeSettings(
    local: Record<string, unknown>,
    incoming: Record<string, unknown>
  ): Record<string, unknown> {
    // Start with the incoming settings (the remote side "wins").
    const merged = { ...incoming };

    // Restore machine-specific keys from the local copy.
    for (const key of MACHINE_SPECIFIC_KEYS) {
      if (key in local) {
        merged[key] = local[key];
      }
    }

    return merged;
  }

  /**
   * Creates a backup of a file before we modify it.
   * If something goes wrong during restore, we can recover.
   * The backup gets a ".bak" extension.
   */
  private backupFile(filePath: string): void {
    if (!existsSync(filePath)) return;

    const backupPath = filePath + ".synkromium-bak";
    try {
      copyFileSync(filePath, backupPath);
    } catch {
      console.warn(`[Synkromium] Could not create backup of ${basename(filePath)}. Proceeding anyway.`);
    }
  }
}
