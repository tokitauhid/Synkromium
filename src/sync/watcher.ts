/**
 * watcher.ts — The lookout.
 *
 * This module keeps an eye on your Chromium config files.
 * When something changes (you installed an extension, tweaked
 * a setting), it notices and tells the sync engine.
 *
 * It's smart enough to wait a few seconds before reacting (debouncing),
 * so rapid-fire changes get bundled into a single sync
 * instead of flooding the system with commits.
 *
 * Under the hood, we use "chokidar" — a battle-tested file watching
 * library that handles all the cross-platform quirks (Linux inotify,
 * macOS FSEvents, Windows ReadDirectoryChanges).
 */

import { watch, type FSWatcher } from "chokidar";
import { DEBOUNCE_DELAY_MS, FILE_STABILITY_THRESHOLD_MS, FILE_POLL_INTERVAL_MS } from "../config/constants.js";

// ─── Types ──────────────────────────────────────────────────────

/** Called when files have changed and it's time to sync. */
export type OnChangeCallback = (changedPaths: string[]) => void;

// ─── The File Watcher ───────────────────────────────────────────

/**
 * Watches a set of file paths and calls you back when they change.
 *
 * Features:
 * - Debounces changes: waits a few seconds of silence before notifying.
 * - Batches changes: multiple file changes become one notification.
 * - Handles atomic saves: waits for temp-file-then-rename patterns.
 * - Can be paused and resumed (critical for preventing sync loops).
 *
 * Usage:
 *   const watcher = new FileWatcher(["/path/to/Preferences", ...]);
 *   watcher.onChange((changedFiles) => {
 *     console.log("Files changed:", changedFiles);
 *     triggerSync();
 *   });
 *   watcher.start();
 *
 *   // Later, during a restore:
 *   watcher.pause();    // Don't react to our own changes
 *   await restore();
 *   watcher.resume();   // Back to watching
 */
export class FileWatcher {
  private paths: string[];
  private watcher: FSWatcher | null = null;
  private callback: OnChangeCallback | null = null;
  private paused: boolean = false;

  // Debounce state: we accumulate changed paths and fire after a quiet period.
  private pendingChanges: Set<string> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(paths: string[]) {
    this.paths = paths;
  }

  // ── Setup ──

  /**
   * Register the callback that fires when files change.
   * You only get ONE callback — the most recent one wins.
   */
  onChange(callback: OnChangeCallback): void {
    this.callback = callback;
  }

  /**
   * Start watching the files.
   * From this point on, any changes will (eventually) trigger the callback.
   */
  start(): void {
    if (this.watcher) {
      // Already watching — don't create a second watcher.
      return;
    }

    this.watcher = watch(this.paths, {
      // Don't fire for existing files when we first start watching.
      // We only care about CHANGES, not the current state.
      ignoreInitial: true,

      // Keep watching even if the app goes idle.
      persistent: true,

      // Wait for files to finish being written before notifying.
      // This handles the case where an app saves by:
      //   1. Writing to a temp file
      //   2. Renaming the temp file to the real filename
      // Without this, we might read a half-written file.
      awaitWriteFinish: {
        stabilityThreshold: FILE_STABILITY_THRESHOLD_MS,
        pollInterval: FILE_POLL_INTERVAL_MS,
      },

      // Handle atomic saves (temp file → rename pattern).
      atomic: true,
    });

    // Listen for changes and additions.
    this.watcher.on("change", (filePath: string) => this.handleFileEvent(filePath));
    this.watcher.on("add", (filePath: string) => this.handleFileEvent(filePath));

    // Log errors but don't crash.
    this.watcher.on("error", (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Synkromium] File watcher error:", message);
    });
  }

  /**
   * Stop watching entirely. Call this when shutting down the app.
   */
  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.pendingChanges.clear();
  }

  // ── Pause / Resume ──

  /**
   * Temporarily stop reacting to file changes.
   *
   * This is CRITICAL for preventing sync loops. When the sync engine
   * is restoring settings (writing files), we don't want the watcher
   * to see those writes and trigger ANOTHER sync.
   *
   * Always pair with resume():
   *   watcher.pause();
   *   await restoreSettings();
   *   watcher.resume();
   */
  pause(): void {
    this.paused = true;

    // Throw away any changes that were accumulating.
    // They're our own writes, not user changes.
    this.pendingChanges.clear();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Resume reacting to file changes after a pause.
   */
  resume(): void {
    this.paused = false;
  }

  /** Is the watcher currently paused? */
  isPaused(): boolean {
    return this.paused;
  }

  /** Is the watcher currently running (even if paused)? */
  isWatching(): boolean {
    return this.watcher !== null;
  }

  // ── Internal Logic ──

  /**
   * Handles a single file change event.
   *
   * Instead of firing the callback immediately, we add the changed
   * file to a "pending" set and reset the debounce timer. The
   * callback only fires after the debounce period passes with
   * no new changes — meaning the user is done making changes
   * and it's safe to sync.
   */
  private handleFileEvent(filePath: string): void {
    // If we're paused (during a restore), silently ignore the event.
    if (this.paused) return;

    // Add to the batch of pending changes.
    this.pendingChanges.add(filePath);

    // Reset the debounce timer.
    // Every new change pushes the sync further into the future,
    // so rapid changes get batched into one sync.
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushChanges();
    }, DEBOUNCE_DELAY_MS);
  }

  /**
   * Fires the callback with all accumulated changes.
   * Called when the debounce timer expires (no new changes
   * for DEBOUNCE_DELAY_MS milliseconds).
   */
  private flushChanges(): void {
    if (this.pendingChanges.size === 0) return;
    if (!this.callback) return;

    // Grab the changes and clear the pending set.
    const changedPaths = Array.from(this.pendingChanges);
    this.pendingChanges.clear();
    this.debounceTimer = null;

    // Fire the callback.
    this.callback(changedPaths);
  }
}
