import { writeFileSync, unlinkSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { LOCK_FILE_NAME, LOCK_TIMEOUT_MS, LOCK_RETRY_INTERVAL_MS } from "../config/constants.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLockPath(repoPath: string): string {
  return join(repoPath, LOCK_FILE_NAME);
}

function isLocked(repoPath: string): boolean {
  return existsSync(getLockPath(repoPath));
}

function isLockStale(repoPath: string): boolean {
  const lockPath = getLockPath(repoPath);
  if (!existsSync(lockPath)) return false;

  try {
    const stats = statSync(lockPath);
    return Date.now() - stats.mtimeMs > LOCK_TIMEOUT_MS;
  } catch {
    // Can't read the lock file — treat as stale to avoid deadlock
    return true;
  }
}

/**
 * Acquires a file-based lock. Waits if another sync is running,
 * breaks stale locks from crashed processes.
 * Always pair with releaseLock() in a try/finally.
 */
export async function acquireLock(repoPath: string): Promise<void> {
  const lockPath = getLockPath(repoPath);
  const startedWaiting = Date.now();

  while (isLocked(repoPath)) {
    if (isLockStale(repoPath)) {
      console.warn(`[Synkromium] Found stale lock (>${LOCK_TIMEOUT_MS / 1000}s old). Breaking it.`);
      releaseLock(repoPath);
      break;
    }

    if (Date.now() - startedWaiting > LOCK_TIMEOUT_MS) {
      console.warn(`[Synkromium] Lock wait timed out after ${LOCK_TIMEOUT_MS / 1000}s. Forcing through.`);
      releaseLock(repoPath);
      break;
    }

    await sleep(LOCK_RETRY_INTERVAL_MS);
  }

  const lockContent = JSON.stringify({
    pid: process.pid,
    lockedAt: new Date().toISOString(),
  });
  writeFileSync(lockPath, lockContent, "utf-8");
}

/** Safe to call even when no lock exists. */
export function releaseLock(repoPath: string): void {
  const lockPath = getLockPath(repoPath);
  try {
    if (existsSync(lockPath)) unlinkSync(lockPath);
  } catch {
    console.warn("[Synkromium] Could not release lock file. It may need manual cleanup.");
  }
}
