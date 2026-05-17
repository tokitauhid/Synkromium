/**
 * lock.ts — The traffic light for sync operations.
 *
 * Only one sync can run at a time. If a push is happening,
 * a pull has to wait (and vice versa). This module uses a
 * simple lock file to make sure syncs never crash into each other.
 *
 * How it works:
 *   1. Before syncing, call acquireLock().
 *   2. If someone else is syncing, we wait patiently.
 *   3. If we wait too long, we assume the lock is "stale"
 *      (maybe the app crashed mid-sync) and break it.
 *   4. When done syncing, call releaseLock(). Always. No exceptions.
 *
 * The lock is just a tiny file on disk. Nothing fancy.
 * If it exists → someone is syncing. If it doesn't → coast is clear.
 */

import { writeFileSync, unlinkSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { LOCK_FILE_NAME, LOCK_TIMEOUT_MS, LOCK_RETRY_INTERVAL_MS } from "../config/constants.js";

// ─── Helpers ────────────────────────────────────────────────────

/**
 * A simple sleep function. We use this to wait between lock checks
 * without burning CPU cycles in a tight loop.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds the full path to the lock file inside the sync repo.
 */
function getLockPath(repoPath: string): string {
  return join(repoPath, LOCK_FILE_NAME);
}

// ─── Lock Status ────────────────────────────────────────────────

/**
 * Checks if a lock file currently exists.
 * If it does, someone (maybe us, maybe a crashed process) is syncing.
 */
export function isLocked(repoPath: string): boolean {
  return existsSync(getLockPath(repoPath));
}

/**
 * Checks if the existing lock is "stale" — meaning it's been there
 * longer than our timeout allows.
 *
 * This catches the case where the app crashes mid-sync and leaves
 * a lock file behind. Without this check, the app would be
 * permanently stuck waiting for a lock that nobody will ever release.
 */
function isLockStale(repoPath: string): boolean {
  const lockPath = getLockPath(repoPath);

  if (!existsSync(lockPath)) {
    return false;
  }

  try {
    const stats = statSync(lockPath);
    const lockAge = Date.now() - stats.mtimeMs;
    return lockAge > LOCK_TIMEOUT_MS;
  } catch {
    // If we can't read the file stats, treat it as stale.
    // Better to break a mystery lock than to freeze forever.
    return true;
  }
}

// ─── Acquiring and Releasing ────────────────────────────────────

/**
 * Grabs the lock so we can sync safely.
 *
 * If another sync is already running, we wait patiently,
 * checking every half second. If we wait longer than the timeout,
 * we assume the lock is stale and break it.
 *
 * The lock file contains our process ID, so if something goes wrong,
 * we can figure out who was holding the lock.
 *
 * IMPORTANT: Always call releaseLock() when you're done,
 * even if something throws an error. Use a try/finally block.
 *
 * Example:
 *   await acquireLock(repoPath);
 *   try {
 *     await doSyncStuff();
 *   } finally {
 *     releaseLock(repoPath);
 *   }
 */
export async function acquireLock(repoPath: string): Promise<void> {
  const lockPath = getLockPath(repoPath);
  const startedWaiting = Date.now();

  // Wait for any existing lock to be released.
  while (isLocked(repoPath)) {
    // Has the lock been sitting there suspiciously long?
    if (isLockStale(repoPath)) {
      console.warn(
        `[Synkromium] Found a stale lock file (older than ${LOCK_TIMEOUT_MS / 1000}s). ` +
        `The previous sync probably crashed. Breaking the lock and continuing.`
      );
      releaseLock(repoPath);
      break;
    }

    // Have WE been waiting too long?
    const waitedFor = Date.now() - startedWaiting;
    if (waitedFor > LOCK_TIMEOUT_MS) {
      console.warn(
        `[Synkromium] Waited ${LOCK_TIMEOUT_MS / 1000}s for the lock. ` +
        `Forcing through — the other sync might be stuck.`
      );
      releaseLock(repoPath);
      break;
    }

    // Not stale, not timed out — just wait a bit and check again.
    await sleep(LOCK_RETRY_INTERVAL_MS);
  }

  // Coast is clear — create the lock file with our process ID.
  // The PID helps with debugging if things go sideways.
  const lockContent = JSON.stringify({
    pid: process.pid,
    lockedAt: new Date().toISOString(),
  });

  writeFileSync(lockPath, lockContent, "utf-8");
}

/**
 * Releases the lock so other syncs can proceed.
 *
 * This is safe to call even if no lock exists — it just does nothing.
 * Better to call it one too many times than one too few.
 */
export function releaseLock(repoPath: string): void {
  const lockPath = getLockPath(repoPath);

  try {
    if (existsSync(lockPath)) {
      unlinkSync(lockPath);
    }
  } catch {
    // If we can't delete the lock file, something weird is going on,
    // but crashing the app over it would make things worse.
    console.warn("[Synkromium] Could not release lock file. It may need manual cleanup.");
  }
}

/**
 * Reads who currently holds the lock (for debugging).
 * Returns null if no lock exists.
 */
export function getLockInfo(repoPath: string): { pid: number; lockedAt: string } | null {
  const lockPath = getLockPath(repoPath);

  if (!existsSync(lockPath)) {
    return null;
  }

  try {
    const raw = readFileSync(lockPath, "utf-8");
    return JSON.parse(raw) as { pid: number; lockedAt: string };
  } catch {
    return null;
  }
}
