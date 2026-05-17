/**
 * lock.ts — The traffic light for sync operations.
 *
 * Only one sync can run at a time. If a push is happening,
 * a pull has to wait (and vice versa). This module uses a
 * simple lock file to make sure syncs never crash into each other.
 *
 * It also detects "stale" locks — if the app crashes mid-sync
 * and leaves a lock behind, we clean it up automatically.
 *
 * Implementation comes in Step 4.
 */
