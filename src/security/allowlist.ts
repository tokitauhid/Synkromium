/**
 * allowlist.ts — The bouncer at the door.
 *
 * This module enforces a strict "guest list" for files.
 * Only files that are explicitly on the allowlist get synced.
 * Everything else is ignored, no matter what.
 *
 * Why an allowlist instead of a blocklist?
 * Because it's safer to say "only sync THESE files" than
 * "sync everything EXCEPT these files." You can't accidentally
 * leak something you never allowed in the first place.
 *
 * The allowlist is defined per-adapter. The Chromium adapter
 * knows exactly which files are safe to sync. If a file isn't
 * on the list, it never leaves your computer. Period.
 */

import { basename } from "node:path";
import { statSync } from "node:fs";
import { MAX_SYNC_FILE_SIZE_BYTES } from "../config/constants.js";

// ─── Types ──────────────────────────────────────────────────────

/**
 * The result of checking a file against the allowlist.
 * If it's not allowed, we tell you exactly why — no mystery rejections.
 */
export interface AllowlistResult {
  /** Can this file be synced? */
  allowed: boolean;

  /** If not allowed, a human-readable explanation of why. */
  reason: string;
}

// ─── The Allowlist ──────────────────────────────────────────────

/**
 * The master list of file patterns that are safe to sync.
 *
 * Each adapter registers its own patterns here. A pattern can be:
 * - An exact filename: "Preferences"
 * - A glob with extension: "*.json"
 *
 * Anything NOT on this list is automatically rejected.
 */
const ALLOWED_PATTERNS: Record<string, string[]> = {
  chromium: [
    "Preferences",           // The main settings file for Chrome/Chromium
    "Secure Preferences",    // Additional settings (theme, extensions metadata)
    "Bookmarks",             // User bookmarks
    "*.json",                // Any JSON config files we explicitly copy
  ],
};

// ─── Pattern Matching ───────────────────────────────────────────

/**
 * Checks if a filename matches a given pattern.
 *
 * Supports two kinds of patterns:
 * - Exact match: "Preferences" matches only "Preferences"
 * - Wildcard extension: "*.json" matches "settings.json", "bookmarks.json", etc.
 *
 * We keep this simple on purpose. Complex glob patterns are
 * harder to audit, and auditability is the whole point of an allowlist.
 */
function matchesPattern(fileName: string, pattern: string): boolean {
  // Wildcard pattern like "*.json"
  if (pattern.startsWith("*")) {
    const extension = pattern.slice(1); // ".json"
    return fileName.endsWith(extension);
  }

  // Exact match
  return fileName === pattern;
}

// ─── The Main Check ─────────────────────────────────────────────

/**
 * Checks whether a specific file is allowed to be synced.
 *
 * This is called before EVERY file gets staged for commit.
 * It checks three things:
 *   1. Is the file on the allowlist for this adapter?
 *   2. Is the file small enough? (Giant files are almost never settings.)
 *   3. Does the file actually exist?
 *
 * If any check fails, the file is rejected with a clear reason.
 *
 * Example:
 *   const result = isFileAllowed("/path/to/Preferences", "chromium");
 *   if (!result.allowed) {
 *     console.log(result.reason); // "File 'SomeWeirdFile' is not on the chromium allowlist."
 *   }
 */
export function isFileAllowed(filePath: string, adapterId: string): AllowlistResult {
  const fileName = basename(filePath);

  // Step 1: Does this adapter even have an allowlist?
  const patterns = ALLOWED_PATTERNS[adapterId];
  if (!patterns) {
    return {
      allowed: false,
      reason: `No allowlist defined for adapter "${adapterId}". Cannot sync unknown adapters.`,
    };
  }

  // Step 2: Does the filename match any allowed pattern?
  const isOnList = patterns.some((pattern) => matchesPattern(fileName, pattern));
  if (!isOnList) {
    return {
      allowed: false,
      reason: `File "${fileName}" is not on the ${adapterId} allowlist. Only explicitly approved files get synced.`,
    };
  }

  // Step 3: Is the file suspiciously large?
  try {
    const stats = statSync(filePath);
    if (stats.size > MAX_SYNC_FILE_SIZE_BYTES) {
      const sizeMB = (stats.size / 1_048_576).toFixed(2);
      return {
        allowed: false,
        reason: `File "${fileName}" is ${sizeMB} MB — too large for a settings file. Max allowed: 1 MB.`,
      };
    }
  } catch {
    return {
      allowed: false,
      reason: `File "${fileName}" could not be read. It may have been deleted or moved.`,
    };
  }

  // All checks passed — this file is cleared for sync.
  return { allowed: true, reason: "" };
}

/**
 * Filters a list of file paths down to only the ones that are
 * allowed to be synced. Returns both the allowed files and a
 * list of rejections (so we can log why files were skipped).
 *
 * This is the batch version of isFileAllowed — use it when
 * you have a bunch of files to check at once.
 */
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

/**
 * Returns the allowlist patterns for a given adapter.
 * Useful for showing users exactly what files will be synced.
 */
export function getAllowlistPatterns(adapterId: string): string[] {
  return ALLOWED_PATTERNS[adapterId] || [];
}
