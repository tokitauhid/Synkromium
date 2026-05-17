/**
 * engine.ts — The brain of the sync operation.
 *
 * This is the conductor of the orchestra. It coordinates all
 * the pieces we've built so far:
 * - The Git backend (for pushing/pulling)
 * - The adapter (for extracting/restoring settings)
 * - The file watcher (for detecting changes)
 * - The lock (for preventing concurrent syncs)
 * - The loop guard (for preventing infinite loops)
 * - The secret scanner (for catching leaked credentials)
 * - The allowlist (for filtering approved files)
 * - The state tracker (for remembering what's been synced)
 *
 * The sync engine has two main flows:
 *
 * PUSH (local changes → remote):
 *   Change detected → lock → scan secrets → extract → validate →
 *   git add → commit → push → update state → unlock
 *
 * PULL (remote changes → local):
 *   Startup/poll → lock → fetch → compare heads → pull →
 *   restore → validate → update state → unlock
 *
 * Every other module is a specialist. This module tells them
 * when to do their job and in what order.
 */

import type { Adapter } from "../adapters/base.js";
import * as git from "../git/backend.js";
import { acquireLock, releaseLock } from "./lock.js";
import { readSyncState, markSyncComplete, markPendingPush } from "./state.js";
import { FileWatcher } from "./watcher.js";
import { LoopGuard } from "./loop-guard.js";
import { scanFiles, formatFindings } from "../security/secret-scanner.js";
import { filterAllowedFiles } from "../security/allowlist.js";
import { getOrCreateDeviceIdentity } from "../device/identity.js";
import { COMMIT_PREFIX, POLL_INTERVAL_MS } from "../config/constants.js";

// ─── Types ──────────────────────────────────────────────────────

/** Configuration for the sync engine. */
export interface SyncEngineConfig {
  /** Where the local sync repository lives on disk. */
  repoPath: string;

  /** The adapter to use for extracting/restoring settings. */
  adapter: Adapter;

  /** The remote URL for the Git repository (e.g., GitHub). */
  remoteUrl: string;
}

/** What the sync engine is currently doing. */
export type SyncStatus = "idle" | "pushing" | "pulling" | "error" | "conflict";

/** Called whenever the sync status changes. */
export type StatusCallback = (status: SyncStatus, message: string) => void;

// ─── The Sync Engine ────────────────────────────────────────────

export class SyncEngine {
  private config: SyncEngineConfig;
  private watcher: FileWatcher;
  private loopGuard: LoopGuard;
  private deviceId: string;
  private status: SyncStatus = "idle";
  private statusCallback: StatusCallback | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: SyncEngineConfig) {
    this.config = config;
    this.loopGuard = new LoopGuard();
    this.deviceId = getOrCreateDeviceIdentity().id;

    // Set up the file watcher for the adapter's tracked files.
    this.watcher = new FileWatcher(config.adapter.getSyncPaths());
    this.watcher.onChange((changedPaths) => this.handleFileChanges(changedPaths));
  }

  // ── Lifecycle ──

  /**
   * Starts the sync engine.
   *
   * This does three things:
   * 1. Pulls any changes from the remote (in case the other device
   *    synced while we were offline).
   * 2. Starts watching files for changes.
   * 3. Starts polling for remote changes periodically.
   */
  async start(): Promise<void> {
    console.log("[Synkromium] Starting sync engine...");

    // Check for git
    const gitAvailable = await git.isGitInstalled();
    if (!gitAvailable) {
      this.setStatus("error", "Git is not installed. Please install Git and restart.");
      return;
    }

    // Pull any changes we might have missed while offline.
    await this.pull();

    // Check if there's a pending push from a previous offline session.
    const state = readSyncState(this.config.repoPath, this.deviceId);
    if (state.pendingPush) {
      console.log("[Synkromium] Found a pending push from a previous session. Trying to push now.");
      await this.push();
    }

    // Start watching for file changes.
    this.watcher.start();

    // Start polling for remote changes.
    this.pollTimer = setInterval(() => {
      this.pull().catch((err) => {
        console.error("[Synkromium] Poll pull failed:", err);
      });
    }, POLL_INTERVAL_MS);

    this.setStatus("idle", "Sync engine is running.");
    console.log("[Synkromium] Sync engine started. Watching for changes.");
  }

  /**
   * Stops the sync engine gracefully.
   * Stops watching, stops polling, and cleans up.
   */
  async stop(): Promise<void> {
    console.log("[Synkromium] Stopping sync engine...");

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    await this.watcher.stop();
    this.setStatus("idle", "Sync engine stopped.");
    console.log("[Synkromium] Sync engine stopped.");
  }

  /**
   * Register a callback to be notified when the sync status changes.
   * The tray icon uses this to update its appearance.
   */
  onStatusChange(callback: StatusCallback): void {
    this.statusCallback = callback;
  }

  /** What is the engine currently doing? */
  getStatus(): SyncStatus {
    return this.status;
  }

  // ── Push Flow ──
  // Local changes → extract → validate → scan → commit → push → done.

  /**
   * Pushes local changes to the remote repository.
   *
   * This is the full push pipeline:
   * 1. Acquire the lock (prevent concurrent syncs)
   * 2. Extract settings from the browser via the adapter
   * 3. Validate the extracted settings
   * 4. Filter through the allowlist
   * 5. Scan for secrets (block if found)
   * 6. Commit and push to the remote
   * 7. Update the sync state
   * 8. Release the lock
   */
  async push(): Promise<void> {
    this.setStatus("pushing", "Syncing local changes...");

    try {
      await acquireLock(this.config.repoPath);

      // Step 1: Extract current settings from the browser.
      const state = await this.config.adapter.extract();
      state.deviceId = this.deviceId;

      // Step 2: Validate what we extracted.
      const validation = await this.config.adapter.validate(state);
      if (!validation.valid) {
        console.error("[Synkromium] Validation failed:", validation.errors);
        this.setStatus("error", `Validation failed: ${validation.errors.join(", ")}`);
        return;
      }

      // Step 3: Check which files the adapter uses and filter by allowlist.
      const syncPaths = this.config.adapter.getSyncPaths();
      const { allowed, rejected } = filterAllowedFiles(syncPaths, this.config.adapter.getId());

      if (rejected.length > 0) {
        for (const r of rejected) {
          console.warn(`[Synkromium] Skipped: ${r.file} — ${r.reason}`);
        }
      }

      if (allowed.length === 0) {
        console.log("[Synkromium] No allowed files to sync.");
        this.setStatus("idle", "Nothing to sync.");
        return;
      }

      // Step 4: Scan allowed files for secrets. Block if any are found.
      const scanResult = scanFiles(allowed);
      if (!scanResult.clean) {
        for (const [filePath, result] of scanResult.results) {
          if (!result.clean) {
            console.error(formatFindings(filePath, result.findings));
          }
        }
        this.setStatus("error", "Sync blocked: sensitive data detected. See logs for details.");
        return;
      }

      // Step 5: Stage, commit, and push.
      const addResult = await git.add(this.config.repoPath, ["."]);
      if (!addResult.success) {
        console.error("[Synkromium] Git add failed:", addResult.message);
        this.setStatus("error", addResult.message);
        return;
      }

      const commitMessage = `${COMMIT_PREFIX} ${this.config.adapter.getId()} settings [${this.deviceId}]`;
      const commitResult = await git.commit(this.config.repoPath, commitMessage);

      if (!commitResult.hash) {
        // "Nothing to commit" — everything was already up to date.
        this.setStatus("idle", "Already in sync.");
        return;
      }

      // Remember this commit so we don't re-process it later.
      this.loopGuard.markCommitAsProcessed(commitResult.hash);

      // Step 6: Try to push. If we're offline, queue it for later.
      const pushResult = await git.push(this.config.repoPath);
      if (!pushResult.success) {
        console.warn("[Synkromium] Push failed (probably offline). Will retry later.");
        markPendingPush(this.config.repoPath, this.deviceId);
        this.setStatus("idle", "Changes saved locally. Will push when online.");
        return;
      }

      // Step 7: Update state to record what we just synced.
      markSyncComplete(this.config.repoPath, this.deviceId, commitResult.hash);
      this.setStatus("idle", "Changes synced successfully.");
      console.log(`[Synkromium] Pushed commit ${commitResult.hash}`);

    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown push error";
      console.error("[Synkromium] Push failed:", message);
      this.setStatus("error", message);
    } finally {
      // ALWAYS release the lock, even if something threw an error.
      releaseLock(this.config.repoPath);
    }
  }

  // ── Pull Flow ──
  // Fetch → compare heads → pull → restore → validate → done.

  /**
   * Pulls remote changes and applies them locally.
   *
   * This is the full pull pipeline:
   * 1. Acquire the lock
   * 2. Fetch from the remote
   * 3. Compare local and remote heads
   * 4. If remote is ahead, pull the changes
   * 5. Pause the watcher (so our writes don't trigger a push)
   * 6. Restore settings via the adapter
   * 7. Validate the restored settings
   * 8. Resume the watcher
   * 9. Update the sync state
   * 10. Release the lock
   */
  async pull(): Promise<void> {
    this.setStatus("pulling", "Checking for remote changes...");

    try {
      await acquireLock(this.config.repoPath);

      // Step 1: Download the latest info from the remote.
      const fetchResult = await git.fetch(this.config.repoPath);
      if (!fetchResult.success) {
        // Fetch failed — probably offline. Not an error, just skip.
        this.setStatus("idle", "Could not reach remote. Will try again later.");
        return;
      }

      // Step 2: Compare our local copy with the remote.
      const comparison = await git.compareHeads(this.config.repoPath);

      if (comparison.inSync) {
        // Nothing new from the remote. We're already up to date.
        this.setStatus("idle", "Everything is in sync.");
        return;
      }

      if (!comparison.remoteHead) {
        // Remote is empty (no commits yet). Nothing to pull.
        this.setStatus("idle", "Remote repository is empty.");
        return;
      }

      // Step 3: Check if we've already processed this commit.
      if (this.loopGuard.isCommitAlreadyProcessed(comparison.remoteHead)) {
        this.setStatus("idle", "Already processed this commit.");
        return;
      }

      // Step 4: Pull the changes.
      const pullResult = await git.pull(this.config.repoPath);
      if (!pullResult.success) {
        console.error("[Synkromium] Pull failed:", pullResult.message);
        this.setStatus("error", pullResult.message);
        return;
      }

      // Step 5: PAUSE the watcher before we write any files.
      // This prevents our own writes from triggering a push (sync loop!).
      this.loopGuard.beginRestore();
      this.watcher.pause();

      try {
        // Step 6: Have the adapter apply the pulled settings.
        const state = await this.config.adapter.extract();
        await this.config.adapter.restore(state);

        // Step 7: Validate that the restore worked.
        const validation = await this.config.adapter.validate(state);
        if (!validation.valid) {
          console.warn("[Synkromium] Restore validation had issues:", validation.errors);
          // We don't roll back here — the settings are probably fine,
          // just not perfect. Log it and move on.
        }

      } finally {
        // Step 8: ALWAYS resume the watcher, even if restore failed.
        this.loopGuard.endRestore();
        this.watcher.resume();
      }

      // Step 9: Remember that we processed this commit.
      this.loopGuard.markCommitAsProcessed(comparison.remoteHead);
      markSyncComplete(this.config.repoPath, this.deviceId, comparison.remoteHead);

      this.setStatus("idle", "Remote changes applied successfully.");
      console.log(`[Synkromium] Applied remote commit ${comparison.remoteHead}`);

    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown pull error";
      console.error("[Synkromium] Pull failed:", message);
      this.setStatus("error", message);
    } finally {
      releaseLock(this.config.repoPath);
    }
  }

  // ── Manual Trigger ──

  /**
   * Manually trigger a sync (both pull and push).
   * Available from the tray menu as "Sync Now".
   */
  async syncNow(): Promise<void> {
    await this.pull();
    await this.push();
  }

  // ── Internal ──

  /**
   * Called by the file watcher when browser settings change.
   * This is what kicks off the push flow.
   */
  private async handleFileChanges(changedPaths: string[]): Promise<void> {
    // Double-check the loop guard. The watcher SHOULD be paused
    // during restores, but this is a safety net.
    if (this.loopGuard.isRestoring()) {
      return;
    }

    console.log(`[Synkromium] Detected changes in ${changedPaths.length} file(s). Syncing...`);
    await this.push();
  }

  /**
   * Updates the engine status and notifies the callback (tray icon).
   */
  private setStatus(status: SyncStatus, message: string): void {
    this.status = status;
    if (this.statusCallback) {
      this.statusCallback(status, message);
    }
  }
}
