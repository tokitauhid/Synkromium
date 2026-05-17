/**
 * base.ts — The rulebook for adapters.
 *
 * An "adapter" is a translator between Synkromium and a specific
 * application (like Chrome, Brave, or Edge). This file defines
 * what every adapter MUST be able to do.
 *
 * Think of it like a job description:
 *   - extract()  → "Can you pull settings out of the app?"
 *   - restore()  → "Can you put settings back in?"
 *   - validate() → "Can you check the settings aren't broken?"
 *
 * If an adapter can't do all of these things, it doesn't ship.
 * This contract is what makes the sync engine adapter-agnostic —
 * it doesn't care if it's syncing Chrome, Brave, or Edge.
 * It just calls extract(), restore(), and validate().
 */

// ─── Normalized State ───────────────────────────────────────────

/**
 * The universal format for extracted settings.
 *
 * No matter what app the settings come from, they all get
 * converted into this shape before being stored or synced.
 * This normalization is what makes cross-device sync possible —
 * the sync engine speaks one language, and adapters translate.
 */
export interface NormalizedState {
  /** Which adapter produced this state (e.g., "chromium"). */
  adapterId: string;

  /** The version of the data format. Used for migrations. */
  schemaVersion: number;

  /** When these settings were extracted (ISO 8601 timestamp). */
  extractedAt: string;

  /** Which device extracted them. */
  deviceId: string;

  /**
   * The actual settings data.
   *
   * This is intentionally flexible (Record<string, unknown>)
   * because every app's settings look different. The adapter
   * is responsible for structuring this correctly.
   */
  data: Record<string, unknown>;
}

// ─── Validation ─────────────────────────────────────────────────

/**
 * The result of validating a set of settings.
 *
 * Validation runs twice:
 * 1. After extracting — to make sure we got clean data before committing.
 * 2. After restoring — to make sure the settings were applied correctly.
 *
 * If validation fails, the sync is rolled back and the user is notified.
 */
export interface ValidationResult {
  /** Did the settings pass all checks? */
  valid: boolean;

  /** If not valid, what went wrong? One message per issue. */
  errors: string[];
}

// ─── The Adapter Interface ──────────────────────────────────────

/**
 * The contract every adapter must follow. No exceptions.
 *
 * If you're building a new adapter (say, for Firefox), you implement
 * this interface and the sync engine handles the rest. You never
 * touch the Git layer, the lock system, or the conflict resolution.
 * You just extract and restore. That's your whole job.
 *
 * Example:
 *   class FirefoxAdapter implements Adapter {
 *     async extract(): Promise<NormalizedState> { ... }
 *     async restore(state: NormalizedState): Promise<void> { ... }
 *     // ... etc.
 *   }
 */
export interface Adapter {
  /**
   * Pull the current settings out of the application.
   *
   * This reads the app's config files and converts them into
   * a NormalizedState that the sync engine can store and ship
   * to other devices.
   *
   * Must be non-destructive — calling extract() should never
   * change anything in the application.
   */
  extract(): Promise<NormalizedState>;

  /**
   * Apply a set of settings to the application.
   *
   * This takes a NormalizedState (usually pulled from another device)
   * and writes it into the app's config files.
   *
   * Must be atomic-ish — if something fails halfway through,
   * the app should still work (even if some settings are old).
   */
  restore(state: NormalizedState): Promise<void>;

  /**
   * Check if a set of settings is valid and safe to use.
   *
   * This catches corrupted data, incompatible versions, and
   * other problems BEFORE they get committed or applied.
   */
  validate(state: NormalizedState): Promise<ValidationResult>;

  /**
   * Return the file paths this adapter watches for changes.
   *
   * The file watcher uses these paths to know when the user
   * changes a setting, so it can trigger a sync.
   */
  getSyncPaths(): string[];

  /**
   * Return the adapter's unique identifier (e.g., "chromium").
   *
   * This is used in commit messages, state tracking, and
   * the allowlist to keep everything organized.
   */
  getId(): string;

  /**
   * Return the schema version this adapter currently uses.
   *
   * When we change how settings are structured, we bump this number
   * and write a migration. That way, an old device can still
   * understand settings from a new device (and vice versa).
   */
  getSchemaVersion(): number;
}
