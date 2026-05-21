import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../utils/logger.js";

export interface SyncState {
  lastAppliedCommit: string;
  lastSyncAt: string;
  deviceId: string;
  /** Commit saved locally but not yet pushed (offline scenario). */
  pendingPush: boolean;
}

const STATE_FILE_NAME = "sync-state.json";

function createEmptyState(deviceId: string): SyncState {
  return {
    lastAppliedCommit: "",
    lastSyncAt: "",
    deviceId,
    pendingPush: false,
  };
}

export function readSyncState(repoPath: string, deviceId: string): SyncState {
  const filePath = join(repoPath, STATE_FILE_NAME);

  if (!existsSync(filePath)) {
    return createEmptyState(deviceId);
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as SyncState;
  } catch {
    logger.warn("[Synkromium] Sync state file was corrupted. Starting fresh.");
    return createEmptyState(deviceId);
  }
}

export function writeSyncState(repoPath: string, state: SyncState): void {
  writeFileSync(join(repoPath, STATE_FILE_NAME), JSON.stringify(state, null, 2), "utf-8");
}

export function markSyncComplete(repoPath: string, deviceId: string, commitHash: string): void {
  const currentState = readSyncState(repoPath, deviceId);
  writeSyncState(repoPath, {
    ...currentState,
    lastAppliedCommit: commitHash,
    lastSyncAt: new Date().toISOString(),
    deviceId,
    pendingPush: false,
  });
}

export function markPendingPush(repoPath: string, deviceId: string): void {
  const currentState = readSyncState(repoPath, deviceId);
  writeSyncState(repoPath, {
    ...currentState,
    pendingPush: true,
    deviceId,
  });
}
