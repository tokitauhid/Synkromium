import type { ConflictDetail } from "./conflict.js";

export interface MergeResult {
  success: boolean;
  merged: Record<string, unknown>;
  conflicts: ConflictDetail[];
}

/**
 * Three-way merge: compares local and remote against a common base.
 * Same-key changes on both sides become conflicts unless they're identical.
 * Arrays get union-merged, nested objects recurse.
 */
export function mergeJson(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  remote: Record<string, unknown>
): MergeResult {
  const merged: Record<string, unknown> = {};
  const conflicts: ConflictDetail[] = [];

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
      if (key in base) merged[key] = baseValue;
    } else if (localChanged && !remoteChanged) {
      if (key in local) merged[key] = localValue;
    } else if (!localChanged && remoteChanged) {
      if (key in remote) merged[key] = remoteValue;
    } else {
      // Both sides changed — check for auto-resolvable cases
      if (deepEqual(localValue, remoteValue)) {
        merged[key] = localValue;
        continue;
      }

      if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
        merged[key] = unionMergeArrays(localValue, remoteValue);
        continue;
      }

      if (isPlainObject(localValue) && isPlainObject(remoteValue) && isPlainObject(baseValue)) {
        const nestedResult = mergeJson(
          baseValue as Record<string, unknown>,
          localValue as Record<string, unknown>,
          remoteValue as Record<string, unknown>
        );
        merged[key] = nestedResult.merged;
        conflicts.push(...nestedResult.conflicts.map((c) => ({
          ...c,
          key: `${key}.${c.key}`,
        })));
        continue;
      }

      // Real conflict — default to local until user decides
      merged[key] = localValue;
      conflicts.push({
        key,
        localValue,
        remoteValue,
        baseValue,
        resolvedWith: "local",
      });
    }
  }

  return { success: conflicts.length === 0, merged, conflicts };
}

/** Combines unique elements from both arrays (JSON-based dedup). */
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

function isPlainObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
