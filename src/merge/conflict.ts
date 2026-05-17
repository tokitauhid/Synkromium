/**
 * conflict.ts — The conflict reporter.
 *
 * When the merge module can't automatically resolve a disagreement
 * between two devices, this module steps in to describe the problem
 * in plain English so the user can make an informed decision.
 *
 * No scary Git jargon. No raw diff output. Just clear, simple choices:
 * "Keep this device's version" or "Keep the other device's version."
 *
 * Each conflict is about one specific setting key — not the whole file.
 * This makes it much less intimidating for the user.
 */

// ─── Types ──────────────────────────────────────────────────────

/**
 * A single conflict between two devices.
 *
 * This captures everything the user needs to see:
 * - What setting is in conflict
 * - What each device has
 * - What the setting was BEFORE either device changed it
 * - Which side is currently "winning" (can be changed by the user)
 */
export interface ConflictDetail {
  /** The setting key in conflict (e.g., "editor.fontSize" or "theme.name"). */
  key: string;

  /** What THIS device has for this setting. */
  localValue: unknown;

  /** What the OTHER device has for this setting. */
  remoteValue: unknown;

  /** What the setting was before either device changed it. */
  baseValue: unknown;

  /**
   * Which side's value is currently being used.
   * Starts as "local" (this device wins by default),
   * but the user can change it to "remote".
   */
  resolvedWith: "local" | "remote";
}

/**
 * A summary of all conflicts in a single sync operation.
 * Used by the UI to show the conflict resolution screen.
 */
export interface ConflictReport {
  /** How many settings are in conflict. */
  count: number;

  /** When the conflict was detected. */
  detectedAt: string;

  /** The individual conflicts, one per setting key. */
  details: ConflictDetail[];
}

// ─── Creating Conflict Reports ──────────────────────────────────

/**
 * Bundles a list of conflict details into a full report.
 * This is what gets passed to the UI for display.
 */
export function createConflictReport(conflicts: ConflictDetail[]): ConflictReport {
  return {
    count: conflicts.length,
    detectedAt: new Date().toISOString(),
    details: conflicts,
  };
}

// ─── Resolving Conflicts ────────────────────────────────────────

/**
 * Resolves a single conflict by choosing a side.
 *
 * Call this when the user clicks "Keep This Device" or "Keep Other Device"
 * in the conflict UI.
 */
export function resolveConflict(conflict: ConflictDetail, keepSide: "local" | "remote"): ConflictDetail {
  return {
    ...conflict,
    resolvedWith: keepSide,
  };
}

/**
 * Resolves ALL conflicts with the same choice.
 * For the "Apply to all" button in the UI.
 */
export function resolveAllConflicts(conflicts: ConflictDetail[], keepSide: "local" | "remote"): ConflictDetail[] {
  return conflicts.map((conflict) => resolveConflict(conflict, keepSide));
}

/**
 * Applies resolved conflicts to a merged settings object.
 *
 * After the user has chosen which side to keep for each conflict,
 * this function updates the merged object with their choices.
 *
 * Returns a new object — the original is not modified.
 */
export function applyResolutions(
  merged: Record<string, unknown>,
  resolvedConflicts: ConflictDetail[]
): Record<string, unknown> {
  const result = { ...merged };

  for (const conflict of resolvedConflicts) {
    const value = conflict.resolvedWith === "local"
      ? conflict.localValue
      : conflict.remoteValue;

    // Handle nested keys like "editor.fontSize" by walking the path.
    setNestedValue(result, conflict.key, value);
  }

  return result;
}

/**
 * Checks if there are any unresolved conflicts remaining.
 * All conflicts default to "local", so technically they're always
 * "resolved" — but this checks if the user has actively made a choice.
 * For now, it just returns whether there ARE conflicts at all.
 */
export function hasConflicts(conflicts: ConflictDetail[]): boolean {
  return conflicts.length > 0;
}

// ─── Formatting for Display ─────────────────────────────────────

/**
 * Formats a single conflict into a human-readable string.
 * Used for console output, logging, and as a fallback when
 * the full UI isn't available.
 *
 * Example output:
 *   Conflict: "editor.fontSize"
 *     This Device:   16
 *     Other Device:  14
 *     Previously:    12
 *     Currently keeping: This Device's value
 */
export function formatConflict(conflict: ConflictDetail): string {
  const lines = [
    `Conflict: "${conflict.key}"`,
    `  This Device:   ${formatValue(conflict.localValue)}`,
    `  Other Device:  ${formatValue(conflict.remoteValue)}`,
    `  Previously:    ${formatValue(conflict.baseValue)}`,
    `  Currently keeping: ${conflict.resolvedWith === "local" ? "This Device" : "Other Device"}'s value`,
  ];

  return lines.join("\n");
}

/**
 * Formats all conflicts into a readable summary.
 */
export function formatConflictReport(report: ConflictReport): string {
  if (report.count === 0) {
    return "No conflicts — everything merged cleanly!";
  }

  const header = `⚠ ${report.count} conflict(s) detected:\n`;
  const details = report.details.map(formatConflict).join("\n\n");

  return header + "\n" + details;
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Formats a value for display. Keeps it short and readable.
 * Objects and arrays get JSON-stringified, primitives stay as-is.
 */
function formatValue(value: unknown): string {
  if (value === undefined) return "(not set)";
  if (value === null) return "null";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Sets a value at a nested key path like "editor.fontSize".
 * Creates intermediate objects if they don't exist.
 */
function setNestedValue(obj: Record<string, unknown>, keyPath: string, value: unknown): void {
  const parts = keyPath.split(".");

  // Simple case: no nesting, just a top-level key.
  if (parts.length === 1) {
    obj[keyPath] = value;
    return;
  }

  // Walk down the path, creating objects as needed.
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof current[part] !== "object" || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  // Set the final value.
  current[parts[parts.length - 1]] = value;
}
