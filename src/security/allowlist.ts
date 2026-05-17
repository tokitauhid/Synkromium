import { basename } from "node:path";
import { statSync } from "node:fs";
import { MAX_SYNC_FILE_SIZE_BYTES } from "../config/constants.js";

export interface AllowlistResult {
  allowed: boolean;
  reason: string;
}

// Allowlist per adapter — only these files ever get synced.
// Using an allowlist (not blocklist) so we can't accidentally leak unknown files.
const ALLOWED_PATTERNS: Record<string, string[]> = {
  chromium: [
    "Preferences",
    "Secure Preferences",
    "Bookmarks",
    "*.json",
  ],
};

function matchesPattern(fileName: string, pattern: string): boolean {
  if (pattern.startsWith("*")) {
    return fileName.endsWith(pattern.slice(1));
  }
  return fileName === pattern;
}

export function isFileAllowed(filePath: string, adapterId: string): AllowlistResult {
  const fileName = basename(filePath);

  const patterns = ALLOWED_PATTERNS[adapterId];
  if (!patterns) {
    return {
      allowed: false,
      reason: `No allowlist defined for adapter "${adapterId}".`,
    };
  }

  if (!patterns.some((p) => matchesPattern(fileName, p))) {
    return {
      allowed: false,
      reason: `File "${fileName}" is not on the ${adapterId} allowlist.`,
    };
  }

  try {
    const stats = statSync(filePath);
    if (stats.size > MAX_SYNC_FILE_SIZE_BYTES) {
      const sizeMB = (stats.size / 1_048_576).toFixed(2);
      return {
        allowed: false,
        reason: `File "${fileName}" is ${sizeMB} MB — too large. Max: 1 MB.`,
      };
    }
  } catch {
    return {
      allowed: false,
      reason: `File "${fileName}" could not be read.`,
    };
  }

  return { allowed: true, reason: "" };
}

export function filterAllowedFiles(
  filePaths: string[],
  adapterId: string
): { allowed: string[]; rejected: Array<{ file: string; reason: string }> } {
  const allowed: string[] = [];
  const rejected: Array<{ file: string; reason: string }> = [];

  for (const filePath of filePaths) {
    const result = isFileAllowed(filePath, adapterId);
    if (result.allowed) {
      allowed.push(filePath);
    } else {
      rejected.push({ file: filePath, reason: result.reason });
    }
  }

  return { allowed, rejected };
}
