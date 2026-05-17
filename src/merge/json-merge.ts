/**
 * json-merge.ts — The peacekeeper for settings.
 *
 * When two devices change the same settings file, this module
 * figures out how to combine them without losing either side's work.
 *
 * It works key-by-key:
 * - If you changed "fontSize" on your laptop and "theme" on your desktop,
 *   both changes get kept. No conflict.
 * - If BOTH devices changed "fontSize" to different values, that's a
 *   real conflict — and we let the user decide.
 *
 * The merge strategy is "last-write-wins per key" for simple values,
 * and "union merge" for arrays (like extension lists).
 */

import type { ConflictDetail } from "./conflict.js";

// ─── Types ──────────────────────────────────────────────────────

/** The result of merging two JSON objects. */
export interface MergeResult {
  /** Did the merge complete without any unresolvable conflicts? */
  success: boolean;

  /** The merged result (may be partial if there are conflicts). */
  merged: Record<string, unknown>;

  /** Any conflicts that need human intervention. */
  conflicts: ConflictDetail[];
}

// ─── The Merge Function ─────────────────────────────────────────

/**
 * Merges two JSON settings objects using a common ancestor (base).
 *
 * The "base" is the last version both devices agreed on.
 * "local" is what this device has now.
 * "remote" is what the other device has now.
 *
 * By comparing both local and remote against the base, we can tell:
 * - Which keys were added by each side
 * - Which keys were modified by each side
 * - Which keys were deleted by each side
 * - Which keys were changed by BOTH sides (conflicts!)
 *
 * Example:
 *   base   = { fontSize: 14, theme: "dark", language: "en" }
 *   local  = { fontSize: 16, theme: "dark", language: "en" }  ← changed fontSize
 *   remote = { fontSize: 14, theme: "light", language: "en" } ← changed theme
 *   merged = { fontSize: 16, theme: "light", language: "en" } ← both changes kept!
 */
export function mergeJson(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  remote: Record<string, unknown>
): MergeResult {
  const merged: Record<string, unknown> = {};
  const conflicts: ConflictDetail[] = [];

  // Gather all keys from all three versions.
  const allKeys = new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ]);

  for (const key of allKeys) {
    const baseValue = base[key];
    const localValue = local[key];
    const remoteValue = remote[key];

    const localChanged = !deepEqual(baseValue, localValue);
    const remoteChanged = !deepEqual(baseValue, remoteValue);

    if (!localChanged && !remoteChanged) {
      // Neither side changed this key. Keep the base value.
      if (key in base) {
        merged[key] = baseValue;
      }
    } else if (localChanged && !remoteChanged) {
      // Only the local side changed this key. Use the local value.
      if (key in local) {
        merged[key] = localValue;
      }
      // If the key was deleted locally (not in local), don't include it.
    } else if (!localChanged && remoteChanged) {
      // Only the remote side changed this key. Use the remote value.
      if (key in remote) {
        merged[key] = remoteValue;
      }
    } else {
      // BOTH sides changed this key. That's a conflict!

      // Special case: if both sides made the SAME change, it's not really a conflict.
      if (deepEqual(localValue, remoteValue)) {
        merged[key] = localValue;
        continue;
      }

      // Special case: if both values are arrays, try union merge.
      if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
        merged[key] = unionMergeArrays(localValue, remoteValue);
        continue;
      }

      // Special case: if both values are objects, recurse.
      if (isPlainObject(localValue) && isPlainObject(remoteValue) && isPlainObject(baseValue)) {
        const nestedResult = mergeJson(
          baseValue as Record<string, unknown>,
          localValue as Record<string, unknown>,
          remoteValue as Record<string, unknown>
        );
        merged[key] = nestedResult.merged;
        conflicts.push(...nestedResult.conflicts.map((c) => ({
          ...c,
          key: `${key}.${c.key}`, // Nest the key path for clarity.
        })));
        continue;
      }

      // It's a real conflict. Use local value as default but report it.
      merged[key] = localValue; // Default to local until user decides.
      conflicts.push({
        key,
        localValue,
        remoteValue,
        baseValue,
        resolvedWith: "local", // Default resolution — user can override.
      });
    }
  }

  return {
    success: conflicts.length === 0,
    merged,
    conflicts,
  };
}

// ─── Array Merging ──────────────────────────────────────────────

/**
 * Merges two arrays by combining unique elements from both.
 *
 * Used for things like extension lists where we want to keep
 * extensions from both devices. If an extension appears on either
 * device, it shows up in the merged result.
 *
 * For arrays of objects, we use JSON serialization to check uniqueness.
 * It's not the most efficient, but it's correct and these arrays are small.
 */
function unionMergeArrays(local: unknown[], remote: unknown[]): unknown[] {
  const seen = new Set<string>();
  const result: unknown[] = [];

  for (const item of [...local, ...remote]) {
    const key = JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Deep equality check for two values.
 * Handles objects, arrays, and primitives.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
  }

  return false;
}

/**
 * Checks if a value is a plain object (not an array, not null).
 */
function isPlainObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
