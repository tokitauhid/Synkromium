/** The universal format adapters convert settings into before syncing. */
export interface NormalizedState {
  adapterId: string;
  schemaVersion: number;
  extractedAt: string;
  deviceId: string;
  data: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Contract for browser adapters. The sync engine is adapter-agnostic —
 * it only calls these methods and doesn't care which browser is behind them.
 */
export interface Adapter {
  /** Read settings from the browser into a portable format. Must be non-destructive. */
  extract(): Promise<NormalizedState>;

  /** Apply a NormalizedState (from another device) to the local browser. */
  restore(state: NormalizedState): Promise<void>;

  /** Check if settings data is valid before committing or applying. */
  validate(state: NormalizedState): Promise<ValidationResult>;

  /** File paths this adapter watches for changes. */
  getSyncPaths(): string[];

  /** Unique identifier for this adapter (e.g., "chromium"). */
  getId(): string;

  /** Schema version for data format migrations. */
  getSchemaVersion(): number;
}
