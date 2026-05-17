export interface ConflictDetail {
  key: string;
  localValue: unknown;
  remoteValue: unknown;
  baseValue: unknown;
  resolvedWith: "local" | "remote";
}

export interface ConflictReport {
  count: number;
  detectedAt: string;
  details: ConflictDetail[];
}

export function createConflictReport(conflicts: ConflictDetail[]): ConflictReport {
  return {
    count: conflicts.length,
    detectedAt: new Date().toISOString(),
    details: conflicts,
  };
}

export function resolveConflict(conflict: ConflictDetail, keepSide: "local" | "remote"): ConflictDetail {
  return { ...conflict, resolvedWith: keepSide };
}

export function resolveAllConflicts(conflicts: ConflictDetail[], keepSide: "local" | "remote"): ConflictDetail[] {
  return conflicts.map((c) => resolveConflict(c, keepSide));
}

export function applyResolutions(
  merged: Record<string, unknown>,
  resolvedConflicts: ConflictDetail[]
): Record<string, unknown> {
  const result = { ...merged };

  for (const conflict of resolvedConflicts) {
    const value = conflict.resolvedWith === "local"
      ? conflict.localValue
      : conflict.remoteValue;

    setNestedValue(result, conflict.key, value);
  }

  return result;
}

export function hasConflicts(conflicts: ConflictDetail[]): boolean {
  return conflicts.length > 0;
}

export function formatConflict(conflict: ConflictDetail): string {
  return [
    `Conflict: "${conflict.key}"`,
    `  This Device:   ${formatValue(conflict.localValue)}`,
    `  Other Device:  ${formatValue(conflict.remoteValue)}`,
    `  Previously:    ${formatValue(conflict.baseValue)}`,
    `  Currently keeping: ${conflict.resolvedWith === "local" ? "This Device" : "Other Device"}'s value`,
  ].join("\n");
}

export function formatConflictReport(report: ConflictReport): string {
  if (report.count === 0) return "No conflicts — everything merged cleanly!";

  const header = `⚠ ${report.count} conflict(s) detected:\n`;
  const details = report.details.map(formatConflict).join("\n\n");
  return header + "\n" + details;
}

function formatValue(value: unknown): string {
  if (value === undefined) return "(not set)";
  if (value === null) return "null";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Sets a value at a dotted key path like "editor.fontSize", creating intermediaries. */
function setNestedValue(obj: Record<string, unknown>, keyPath: string, value: unknown): void {
  const parts = keyPath.split(".");

  if (parts.length === 1) {
    obj[keyPath] = value;
    return;
  }

  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof current[part] !== "object" || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}
