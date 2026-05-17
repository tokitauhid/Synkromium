/**
 * state.ts — The memory of the sync engine.
 *
 * This module remembers:
 * - What was the last commit we successfully synced?
 * - When did that sync happen?
 * - Which device did the syncing?
 * - Is there a push waiting to go out (because we were offline)?
 *
 * Without this, the app would have no idea what's already been
 * synced and what's new. It would either re-sync everything
 * every time (wasteful) or miss changes entirely (dangerous).
 *
 * The state is stored as a simple JSON file inside the sync repo.
 * You can open it in a text editor if you're curious — no secrets here.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ─── Types ──────────────────────────────────────────────────────

/**
 * Everything we need to remember about the last sync.
 */
export interface SyncState {
  /** The commit hash we last successfully applied or pushed. */
  lastAppliedCommit: string;

  /** When the last sync happened (ISO 8601 timestamp). */
  lastSyncAt: string;

  /** Which device performed the last sync. */
  deviceId: string;

  /**
   * Is there a commit sitting locally that we haven't been able
   * to push yet? This happens when we're offline — we save the
   * commit locally and push it when the internet comes back.
   */
  pendingPush: boolean;
}

// ─── Defaults ───────────────────────────────────────────────────

/** The name of the state file inside the sync repo. */
const STATE_FILE_NAME = "sync-state.json";

/**
 * What the state looks like when we're starting completely fresh.
 * No commits, no syncs, no pending pushes — a blank slate.
 */
function createEmptyState(deviceId: string): SyncState {
  return {
    lastAppliedCommit: "",
    lastSyncAt: "",
    deviceId,
    pendingPush: false,
  };
}

// ─── Reading State ──────────────────────────────────────────────

/**
 * Loads the sync state from disk.
 *
 * If no state file exists yet (first run), returns a blank state
 * for the given device. No errors, no drama — just a clean start.
 */
export function readSyncState(repoPath: string, deviceId: string): SyncState {
  const filePath = join(repoPath, STATE_FILE_NAME);

  if (!existsSync(filePath)) {
    return createEmptyState(deviceId);
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as SyncState;
  } catch {
    // If the file is corrupted, start fresh rather than crash.
    // We'll overwrite it on the next successful sync.
    console.warn("[Synkromium] Sync state file was corrupted. Starting with a clean state.");
    return createEmptyState(deviceId);
  }
}

// ─── Writing State ──────────────────────────────────────────────

/**
 * Saves the current sync state to disk.
 *
 * This is called after every successful sync operation
 * so we remember exactly where we left off.
 */
export function writeSyncState(repoPath: string, state: SyncState): void {
  const filePath = join(repoPath, STATE_FILE_NAME);
  const prettyJson = JSON.stringify(state, null, 2);
  writeFileSync(filePath, prettyJson, "utf-8");
}

// ─── Convenience Updaters ───────────────────────────────────────
//
// These make it easy to update just one part of the state
// without having to read, modify, and write the whole thing manually.

/**
 * Records that we just finished syncing a specific commit.
 * Updates the commit hash, the timestamp, and clears the pending push flag.
 *
 * Call this after a successful push or after applying a pulled commit.
 */
export function markSyncComplete(
  repoPath: string,
  deviceId: string,
  commitHash: string
): void {
  const currentState = readSyncState(repoPath, deviceId);

  const updatedState: SyncState = {
    ...currentState,
    lastAppliedCommit: commitHash,
    lastSyncAt: new Date().toISOString(),
    deviceId,
    pendingPush: false,
  };

  writeSyncState(repoPath, updatedState);
}

/**
 * Marks that we have a commit ready to push but couldn't
 * because we're offline. The sync engine will retry later.
 */
export function markPendingPush(repoPath: string, deviceId: string): void {
  const currentState = readSyncState(repoPath, deviceId);

  const updatedState: SyncState = {
    ...currentState,
    pendingPush: true,
    deviceId,
  };

  writeSyncState(repoPath, updatedState);
}

/**
 * Quick check: do we have an unsent commit waiting to be pushed?
 */
export function hasPendingPush(repoPath: string, deviceId: string): boolean {
  const state = readSyncState(repoPath, deviceId);
  return state.pendingPush;
}

/**
 * Quick check: has this specific commit already been applied?
 * This prevents us from re-processing our own commits (sync loops).
 */
export function isCommitAlreadyApplied(
  repoPath: string,
  deviceId: string,
  commitHash: string
): boolean {
  const state = readSyncState(repoPath, deviceId);
  return state.lastAppliedCommit === commitHash;
}
