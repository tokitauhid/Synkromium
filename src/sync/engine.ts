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

export interface SyncEngineConfig {
  repoPath: string;
  adapter: Adapter;
  remoteUrl: string;
}

export type SyncStatus = "idle" | "pushing" | "pulling" | "error" | "conflict";
export type StatusCallback = (status: SyncStatus, message: string) => void;

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
    this.watcher = new FileWatcher(config.adapter.getSyncPaths());
    this.watcher.onChange((changedPaths) => this.handleFileChanges(changedPaths));
  }

  async start(): Promise<void> {
    console.log("[Synkromium] Starting sync engine...");

    const gitAvailable = await git.isGitInstalled();
    if (!gitAvailable) {
      this.setStatus("error", "Git is not installed. Please install Git and restart.");
      return;
    }

    await this.pull();

    // Retry any push that failed during a previous offline session
    const state = readSyncState(this.config.repoPath, this.deviceId);
    if (state.pendingPush) {
      console.log("[Synkromium] Retrying pending push from previous session.");
      await this.push();
    }

    this.watcher.start();

    this.pollTimer = setInterval(() => {
      this.pull().catch((err) => {
        console.error("[Synkromium] Poll pull failed:", err);
      });
    }, POLL_INTERVAL_MS);

    this.setStatus("idle", "Sync engine is running.");
    console.log("[Synkromium] Sync engine started.");
  }

  async stop(): Promise<void> {
    console.log("[Synkromium] Stopping sync engine...");

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    await this.watcher.stop();
    this.setStatus("idle", "Sync engine stopped.");
  }

  onStatusChange(callback: StatusCallback): void {
    this.statusCallback = callback;
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  /**
   * Push: extract → validate → allowlist → secret scan → commit → push
   */
  async push(): Promise<void> {
    this.setStatus("pushing", "Syncing local changes...");

    try {
      await acquireLock(this.config.repoPath);

      const state = await this.config.adapter.extract();
      state.deviceId = this.deviceId;

      const validation = await this.config.adapter.validate(state);
      if (!validation.valid) {
        console.error("[Synkromium] Validation failed:", validation.errors);
        this.setStatus("error", `Validation failed: ${validation.errors.join(", ")}`);
        return;
      }

      const syncPaths = this.config.adapter.getSyncPaths();
      const { allowed, rejected } = filterAllowedFiles(syncPaths, this.config.adapter.getId());

      for (const r of rejected) {
        console.warn(`[Synkromium] Skipped: ${r.file} — ${r.reason}`);
      }

      if (allowed.length === 0) {
        this.setStatus("idle", "Nothing to sync.");
        return;
      }

      const scanResult = scanFiles(allowed);
      if (!scanResult.clean) {
        for (const [filePath, result] of scanResult.results) {
          if (!result.clean) console.error(formatFindings(filePath, result.findings));
        }
        this.setStatus("error", "Sync blocked: sensitive data detected. See logs for details.");
        return;
      }

      const addResult = await git.add(this.config.repoPath, ["."]);
      if (!addResult.success) {
        this.setStatus("error", addResult.message);
        return;
      }

      const commitMessage = `${COMMIT_PREFIX} ${this.config.adapter.getId()} settings [${this.deviceId}]`;
      const commitResult = await git.commit(this.config.repoPath, commitMessage);

      if (!commitResult.hash) {
        this.setStatus("idle", "Already in sync.");
        return;
      }

      this.loopGuard.markCommitAsProcessed(commitResult.hash);

      const pushResult = await git.push(this.config.repoPath);
      if (!pushResult.success) {
        console.warn("[Synkromium] Push failed (probably offline). Will retry later.");
        markPendingPush(this.config.repoPath, this.deviceId);
        this.setStatus("idle", "Changes saved locally. Will push when online.");
        return;
      }

      markSyncComplete(this.config.repoPath, this.deviceId, commitResult.hash);
      this.setStatus("idle", "Changes synced successfully.");
      console.log(`[Synkromium] Pushed commit ${commitResult.hash}`);

    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown push error";
      console.error("[Synkromium] Push failed:", message);
      this.setStatus("error", message);
    } finally {
      releaseLock(this.config.repoPath);
    }
  }

  /**
   * Pull: fetch → compare heads → pull → pause watcher → restore → resume
   */
  async pull(): Promise<void> {
    this.setStatus("pulling", "Checking for remote changes...");

    try {
      await acquireLock(this.config.repoPath);

      const fetchResult = await git.fetch(this.config.repoPath);
      if (!fetchResult.success) {
        this.setStatus("idle", "Could not reach remote. Will try again later.");
        return;
      }

      const comparison = await git.compareHeads(this.config.repoPath);

      if (comparison.inSync) {
        this.setStatus("idle", "Everything is in sync.");
        return;
      }

      if (!comparison.remoteHead) {
        this.setStatus("idle", "Remote repository is empty.");
        return;
      }

      if (this.loopGuard.isCommitAlreadyProcessed(comparison.remoteHead)) {
        this.setStatus("idle", "Already processed this commit.");
        return;
      }

      const pullResult = await git.pull(this.config.repoPath);
      if (!pullResult.success) {
        console.error("[Synkromium] Pull failed:", pullResult.message);
        this.setStatus("error", pullResult.message);
        return;
      }

      // Pause watcher so our own file writes don't trigger another push
      this.loopGuard.beginRestore();
      this.watcher.pause();

      try {
        const state = await this.config.adapter.extract();
        await this.config.adapter.restore(state);

        const validation = await this.config.adapter.validate(state);
        if (!validation.valid) {
          console.warn("[Synkromium] Restore validation had issues:", validation.errors);
        }
      } finally {
        this.loopGuard.endRestore();
        this.watcher.resume();
      }

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

  async syncNow(): Promise<void> {
    await this.pull();
    await this.push();
  }

  private async handleFileChanges(changedPaths: string[]): Promise<void> {
    if (this.loopGuard.isRestoring()) return;

    console.log(`[Synkromium] Detected changes in ${changedPaths.length} file(s). Syncing...`);
    await this.push();
  }

  private setStatus(status: SyncStatus, message: string): void {
    this.status = status;
    if (this.statusCallback) this.statusCallback(status, message);
  }
}
