import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  source: "webstore" | "sideloaded" | "policy" | "unknown";
}

// Chrome's built-in extensions — skip these during extraction
const BUILT_IN_EXTENSION_IDS = [
  "nmmhkkegccagdldgiimedpiccmgmieda",
  "pkedcjkdefgpdelpbcmbmeomcjbeemfm",
];

/**
 * Reads installed extensions from a Chrome profile's Secure Preferences.
 * Returns IDs, names, and versions — not the extension files themselves.
 */
export function extractExtensions(profilePath: string): ExtensionInfo[] {
  const securePrefsPath = join(profilePath, "Secure Preferences");
  if (!existsSync(securePrefsPath)) return [];

  let securePrefs: Record<string, unknown>;

  try {
    securePrefs = JSON.parse(readFileSync(securePrefsPath, "utf-8")) as Record<string, unknown>;
  } catch {
    console.warn("[Synkromium] Could not read Secure Preferences. Skipping extension extraction.");
    return [];
  }

  const extensionsSection = securePrefs["extensions"] as Record<string, unknown> | undefined;
  if (!extensionsSection) return [];

  const settingsMap = extensionsSection["settings"] as Record<string, Record<string, unknown>> | undefined;
  if (!settingsMap) return [];

  const extensions: ExtensionInfo[] = [];

  for (const [extId, extData] of Object.entries(settingsMap)) {
    if (BUILT_IN_EXTENSION_IDS.includes(extId)) continue;
    if (extData["install_type"] === "component") continue;

    const manifest = extData["manifest"] as Record<string, unknown> | undefined;
    const name = (manifest?.["name"] as string) || (extData["name"] as string) || "Unknown Extension";
    const version = (manifest?.["version"] as string) || (extData["version"] as string) || "0.0.0";

    // Chrome: state 0 = enabled, state 1 = disabled
    const state = extData["state"] as number | undefined;
    const enabled = state !== 1;

    const source = determineSource(extData);

    extensions.push({ id: extId, name, version, enabled, source });
  }

  return extensions.sort((a, b) => a.name.localeCompare(b.name));
}

function determineSource(extData: Record<string, unknown>): ExtensionInfo["source"] {
  const installType = extData["install_type"] as string | undefined;

  if (installType === "normal" || extData["from_webstore"] === true) return "webstore";
  if (installType === "sideload") return "sideloaded";
  if (installType === "admin") return "policy";
  return "unknown";
}
