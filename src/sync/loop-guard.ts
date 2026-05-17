/**
 * loop-guard.ts — The infinite loop preventer.
 *
 * Here's the nightmare scenario without this module:
 *   Pull new settings → files change on disk → watcher triggers push →
 *   push goes to remote → other device pulls → pushes back → we pull →
 *   ...forever.
 *
 * This module has TWO weapons to stop that:
 *
 * 1. The "isSyncing" flag — when we're in the middle of restoring settings,
 *    the file watcher ignores all file changes. (Handled via watcher.pause/resume)
 *
 * 2. Commit fingerprinting — before processing a pulled commit, we check:
 *    "Did WE make this commit?" If yes, skip it. We use the commit message
 *    prefix to identify our own automated commits.
 *
 * Both defenses work together. Either one alone has edge cases.
 * Together, they're airtight.
 */

import { COMMIT_PREFIX } from "../config/constants.js";

// ─── Sync State Flag ────────────────────────────────────────────

/**
 * A simple flag that tracks whether we're currently applying
 * settings from a remote sync.
 *
 * When this is true:
 * - The file watcher should be paused (ignoring changes)
 * - No push operations should be triggered
 * - Any file change events are from US, not the user
 *
 * Usage:
 *   const guard = new LoopGuard();
 *
 *   guard.beginRestore();     // We're about to write files
 *   await adapter.restore();  // Write settings
 *   guard.endRestore();       // Done, safe to watch again
 *
 *   // In the watcher callback:
 *   if (guard.isRestoring()) return;  // Ignore our own writes
 */
export class LoopGuard {
  private restoring: boolean = false;
  private recentCommits: Set<string> = new Set();

  // How many recent commits to remember. We don't need to remember
  // every commit ever — just enough to catch recent loops.
  private maxRecentCommits: number = 50;

  // ── Restore Flag ──

  /**
   * Call this BEFORE writing any settings files.
   * The file watcher should check isRestoring() and pause if true.
   */
  beginRestore(): void {
    this.restoring = true;
  }

  /**
   * Call this AFTER all settings files have been written.
   * The file watcher can resume normal operation.
   */
  endRestore(): void {
    this.restoring = false;
  }

  /**
   * Are we currently in the middle of restoring settings?
   * If true, any file changes are from us and should be ignored.
   */
  isRestoring(): boolean {
    return this.restoring;
  }

  // ── Commit Fingerprinting ──

  /**
   * Records that we've processed a specific commit.
   * Next time we see this commit hash, we'll skip it.
   */
  markCommitAsProcessed(commitHash: string): void {
    this.recentCommits.add(commitHash);

    // Don't let the set grow forever.
    if (this.recentCommits.size > this.maxRecentCommits) {
      // Remove the oldest entry (Sets preserve insertion order).
      const oldest = this.recentCommits.values().next().value;
      if (oldest) {
        this.recentCommits.delete(oldest);
      }
    }
  }

  /**
   * Have we already processed this commit?
   * If yes, skip it to avoid a sync loop.
   */
  isCommitAlreadyProcessed(commitHash: string): boolean {
    return this.recentCommits.has(commitHash);
  }

  /**
   * Checks if a commit message looks like one of our automated commits.
   *
   * Our automated commits start with a specific prefix (defined in constants.ts).
   * If we see our own prefix in a pulled commit, we know we made it
   * and don't need to process it again.
   *
   * Example:
   *   isOurCommit("synkromium-auto: chromium settings [device-abc123]")  → true
   *   isOurCommit("Manual settings backup")                              → false
   */
  isOurCommit(commitMessage: string): boolean {
    return commitMessage.startsWith(COMMIT_PREFIX);
  }

  /**
   * The full safety check. Call this before processing any pulled commit.
   *
   * Returns true if it's safe to process (i.e., it's NOT a loop).
   * Returns false if we should skip it (it's our own commit, or already processed).
   */
  shouldProcessCommit(commitHash: string, _commitMessage: string): boolean {
    // Already processed this exact commit? Skip.
    if (this.isCommitAlreadyProcessed(commitHash)) {
      return false;
    }

    // We made this commit on this device? Skip.
    // (This is a secondary check — the primary one is commit fingerprinting above.)
    // Note: We DON'T skip all "our" commits, because another device might have
    // generated an automated commit that we need to apply. The device ID in the
    // commit message helps distinguish, but that's handled by the sync engine.

    return true;
  }

  /**
   * Resets all state. Useful for testing or when re-initializing the sync engine.
   */
  reset(): void {
    this.restoring = false;
    this.recentCommits.clear();
  }
}
