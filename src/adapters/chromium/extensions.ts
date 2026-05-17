/**
 * extensions.ts — The extension list manager.
 *
 * This module reads the list of browser extensions you have
 * installed and saves just the IDs, names, and versions —
 * NOT the actual extension files (those are huge and downloadable
 * from the Chrome Web Store anyway).
 *
 * On another device, these IDs can be used to tell the user
 * which extensions they need to install to match their other setup.
 *
 * Where does Chrome keep extension info?
 * In the "Secure Preferences" file under the "extensions.settings" key,
 * and also in individual manifest.json files inside each extension's folder.
 * We read from both sources to get the most complete picture.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ─── Types ──────────────────────────────────────────────────────

/** Everything we need to know about one installed extension. */
export interface ExtensionInfo {
  /** The unique extension ID (like "cjpalhdlnbpafiamejdnhcphjbkeiagm"). */
  id: string;

  /** The human-readable name (like "uBlock Origin"). */
  name: string;

  /** The version currently installed (like "1.52.0"). */
  version: string;

  /** Is the extension currently enabled? */
  enabled: boolean;

  /**
   * Where the extension came from:
   * - "webstore" = installed from Chrome Web Store
   * - "sideloaded" = installed manually
   * - "policy" = installed by an admin/organization
   * - "unknown" = we couldn't figure it out
   */
  source: "webstore" | "sideloaded" | "policy" | "unknown";
}

// ─── Chrome's Internal Extension IDs ────────────────────────────

/**
 * Extensions that are built into Chrome itself.
 * We skip these because:
 * 1. They exist on every Chrome installation already.
 * 2. They can't be installed or removed by the user.
 * 3. They'd just clutter the sync data.
 */
const BUILT_IN_EXTENSION_PREFIXES = [
  "nmmhkkegccagdldgiimedpiccmgmieda",  // Chrome Web Store Payments
  "pkedcjkdefgpdelpbcmbmeomcjbeemfm",  // Chrome Media Router
];

// ─── Extracting Extensions ──────────────────────────────────────

/**
 * Reads the list of installed extensions from a Chrome profile.
 *
 * We get extension info from the "Secure Preferences" file,
 * which contains a map of extension IDs to their settings.
 * For each extension, we pull out the name, version, and status.
 *
 * Returns a clean list of ExtensionInfo objects, sorted by name
 * for easy reading.
 *
 * Example:
 *   const extensions = extractExtensions("/home/tokit/.config/google-chrome/Default");
 *   → [{ id: "cjpalh...", name: "uBlock Origin", version: "1.52.0", ... }]
 */
export function extractExtensions(profilePath: string): ExtensionInfo[] {
  const securePrefsPath = join(profilePath, "Secure Preferences");

  if (!existsSync(securePrefsPath)) {
    // No Secure Preferences file? Browser might not be set up yet.
    return [];
  }

  let securePrefs: Record<string, unknown>;

  try {
    const raw = readFileSync(securePrefsPath, "utf-8");
    securePrefs = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    console.warn("[Synkromium] Could not read Secure Preferences. Skipping extension extraction.");
    return [];
  }

  // Chrome stores extension settings under "extensions" → "settings".
  const extensionsSection = securePrefs["extensions"] as Record<string, unknown> | undefined;
  if (!extensionsSection) return [];

  const settingsMap = extensionsSection["settings"] as Record<string, Record<string, unknown>> | undefined;
  if (!settingsMap) return [];

  const extensions: ExtensionInfo[] = [];

  for (const [extId, extData] of Object.entries(settingsMap)) {
    // Skip Chrome's built-in extensions.
    if (isBuiltInExtension(extId)) continue;

    // Skip component extensions (internal Chrome stuff).
    if (extData["install_type"] === "component") continue;

    // Pull out the info we care about.
    const manifest = extData["manifest"] as Record<string, unknown> | undefined;
    const name = (manifest?.["name"] as string) || (extData["name"] as string) || "Unknown Extension";
    const version = (manifest?.["version"] as string) || (extData["version"] as string) || "0.0.0";

    // Figure out if it's enabled.
    // In Chrome's data, state 0 = enabled, state 1 = disabled.
    const state = extData["state"] as number | undefined;
    const enabled = state !== 1;

    // Figure out where it came from.
    const source = determineSource(extData);

    extensions.push({ id: extId, name, version, enabled, source });
  }

  // Sort by name so the list is easy to scan.
  return extensions.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Gets just the extension IDs (useful for quick comparisons
 * between devices without loading all the metadata).
 */
export function extractExtensionIds(profilePath: string): string[] {
  return extractExtensions(profilePath).map((ext) => ext.id);
}

/**
 * Compares the extension lists from two devices and tells you
 * what's different.
 *
 * Returns:
 * - onlyOnLocal: extensions installed here but not on the other device
 * - onlyOnRemote: extensions on the other device but not here
 * - onBoth: extensions installed on both devices
 *
 * This helps the UI show the user a clear picture of what will
 * change when they sync.
 */
export function compareExtensions(
  localExtensions: ExtensionInfo[],
  remoteExtensions: ExtensionInfo[]
): {
  onlyOnLocal: ExtensionInfo[];
  onlyOnRemote: ExtensionInfo[];
  onBoth: ExtensionInfo[];
} {
  const localIds = new Set(localExtensions.map((e) => e.id));
  const remoteIds = new Set(remoteExtensions.map((e) => e.id));

  return {
    onlyOnLocal: localExtensions.filter((e) => !remoteIds.has(e.id)),
    onlyOnRemote: remoteExtensions.filter((e) => !localIds.has(e.id)),
    onBoth: localExtensions.filter((e) => remoteIds.has(e.id)),
  };
}

// ─── Helpers ────────────────────────────────────────────────────

/** Checks if an extension ID belongs to a Chrome built-in. */
function isBuiltInExtension(extensionId: string): boolean {
  return BUILT_IN_EXTENSION_PREFIXES.includes(extensionId);
}

/**
 * Figures out where an extension was installed from based on
 * Chrome's internal metadata.
 */
function determineSource(extData: Record<string, unknown>): ExtensionInfo["source"] {
  const installType = extData["install_type"] as string | undefined;

  // Chrome uses numeric install types internally, but some
  // versions use string types. We handle both.
  if (installType === "normal" || extData["from_webstore"] === true) {
    return "webstore";
  }
  if (installType === "sideload") {
    return "sideloaded";
  }
  if (installType === "admin") {
    return "policy";
  }

  return "unknown";
}
