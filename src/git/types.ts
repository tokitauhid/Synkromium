/**
 * types.ts — Shared types for the Git layer.
 *
 * These are the "shapes" of data that flow through the Git backend.
 * By defining them upfront, every part of the app agrees on what
 * a commit result looks like, what a status report contains, etc.
 *
 * Think of these as the "vocabulary" of our Git conversations.
 * When the sync engine asks "what's the status?", the Git backend
 * answers using these exact shapes — no guessing, no misunderstandings.
 */

// ─── Git Status ─────────────────────────────────────────────────

/**
 * A snapshot of what's happening in the local Git repo right now.
 *
 * "Are there changes waiting to be committed? Is everything clean?
 *  What files have been modified?"
 */
export interface GitStatus {
  /** Are there any uncommitted changes at all? */
  hasChanges: boolean;

  /** Files that have been modified but not yet staged (git add). */
  modifiedFiles: string[];

  /** Files that are new and Git doesn't know about yet. */
  untrackedFiles: string[];

  /** Files that have been staged and are ready to commit. */
  stagedFiles: string[];
}

// ─── Commit Results ─────────────────────────────────────────────

/**
 * What we get back after making a commit.
 * The hash is the unique fingerprint of that commit —
 * we use it later to track what's been synced.
 */
export interface CommitResult {
  /** The short commit hash, like "a1b2c3d". */
  hash: string;

  /** The full commit message we used. */
  message: string;
}

// ─── Remote Comparison ──────────────────────────────────────────

/**
 * When we compare our local repo to the remote (GitHub),
 * this tells us who's ahead, who's behind, or if they match.
 */
export interface HeadComparison {
  /** The commit hash of our local copy. */
  localHead: string;

  /** The commit hash on the remote (GitHub). */
  remoteHead: string;

  /** Are they the same? If so, nothing to sync. */
  inSync: boolean;
}

// ─── Operation Outcomes ─────────────────────────────────────────

/**
 * A simple success-or-failure result for Git operations.
 *
 * Why not just throw errors? Because some "failures" are expected
 * and recoverable (like "nothing to commit" or "already up to date").
 * We want the sync engine to handle those gracefully, not crash.
 */
export interface GitOperationResult {
  /** Did the operation succeed? */
  success: boolean;

  /** A human-readable description of what happened. */
  message: string;
}
