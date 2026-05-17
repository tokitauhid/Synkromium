/**
 * backend.ts — The Git translator.
 *
 * This module talks to the real `git` command-line tool on your
 * computer. It wraps every Git command (init, add, commit, push, etc.)
 * in a clean, easy-to-use function.
 *
 * The rest of the app NEVER touches Git directly — it always
 * goes through this module. That way, if we ever need to swap
 * out the Git CLI for something else (like libgit2 or isomorphic-git),
 * we only change this one file. Everything else stays the same.
 *
 * Every function here does exactly ONE thing, and its name tells you what.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitStatus, CommitResult, HeadComparison, GitOperationResult } from "./types.js";

// Turn the callback-based execFile into a promise-based one.
// This lets us use async/await instead of nested callbacks.
const execFileAsync = promisify(execFile);

// ─── Running Git Commands ───────────────────────────────────────

/**
 * Runs a git command and returns whatever it prints out.
 *
 * This is the low-level workhorse that every other function uses.
 * It runs `git <args>` in the specified directory and gives back
 * the output as a clean string (no trailing newlines).
 *
 * If the command fails, it throws an error with the full details
 * so we can figure out what went wrong.
 */
async function runGit(repoPath: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: repoPath,
      // 10 seconds should be enough for any local Git command.
      // Network commands (push/pull/fetch) might need more,
      // but we handle timeouts separately for those.
      timeout: 30_000,
    });
    return stdout.trim();
  } catch (error: unknown) {
    // Pull out the useful error message from Git's stderr.
    const gitError = error as { stderr?: string; message?: string };
    const details = gitError.stderr || gitError.message || "Unknown git error";
    throw new Error(`Git command failed: git ${args.join(" ")}\n${details}`);
  }
}

// ─── Repository Setup ───────────────────────────────────────────

/**
 * Creates a brand new Git repository in the given directory.
 * This is only called once — when the user sets up Synkromium
 * for the first time on a device.
 */
export async function init(repoPath: string): Promise<GitOperationResult> {
  try {
    await runGit(repoPath, ["init", "--initial-branch", "main"]);
    return { success: true, message: "Repository initialized." };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to initialize repository.";
    return { success: false, message };
  }
}

/**
 * Connects the local repo to a remote GitHub repository.
 * After this, push and pull know where to send/receive data.
 */
export async function addRemote(repoPath: string, remoteUrl: string): Promise<GitOperationResult> {
  try {
    await runGit(repoPath, ["remote", "add", "origin", remoteUrl]);
    return { success: true, message: `Remote added: ${remoteUrl}` };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add remote.";
    return { success: false, message };
  }
}

// ─── Staging and Committing ─────────────────────────────────────

/**
 * Stages specific files for the next commit.
 *
 * "Staging" means telling Git: "I want these files included
 * in the next commit." It's like putting items in a shopping cart
 * before checking out.
 */
export async function add(repoPath: string, files: string[]): Promise<GitOperationResult> {
  try {
    await runGit(repoPath, ["add", ...files]);
    return { success: true, message: `Staged ${files.length} file(s).` };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to stage files.";
    return { success: false, message };
  }
}

/**
 * Creates a commit with the staged files and a descriptive message.
 *
 * A commit is a "save point" — a snapshot of your settings at this
 * exact moment. You can always come back to any commit later.
 *
 * Returns the commit hash (a unique fingerprint) so the sync engine
 * can track what's been synced.
 */
export async function commit(repoPath: string, message: string): Promise<CommitResult> {
  try {
    await runGit(repoPath, ["commit", "-m", message]);

    // Grab the hash of the commit we just made.
    const hash = await runGit(repoPath, ["rev-parse", "--short", "HEAD"]);

    return { hash, message };
  } catch (error: unknown) {
    // "nothing to commit" is not really an error — it just means
    // nothing changed since the last commit. We handle it gracefully.
    const errorMessage = error instanceof Error ? error.message : "";
    if (errorMessage.includes("nothing to commit")) {
      return { hash: "", message: "Nothing to commit — everything is already up to date." };
    }
    throw error;
  }
}

// ─── Syncing with the Remote ────────────────────────────────────

/**
 * Pushes local commits to the remote repository (GitHub).
 * This is how your settings travel from this device to the cloud.
 */
export async function push(repoPath: string): Promise<GitOperationResult> {
  try {
    await runGit(repoPath, ["push", "origin", "main"]);
    return { success: true, message: "Pushed to remote." };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to push.";
    return { success: false, message };
  }
}

/**
 * Downloads new commits from the remote WITHOUT applying them yet.
 *
 * Fetch is like checking your mailbox — you see what's there,
 * but you haven't opened the letters yet. We do this before
 * comparing heads to see if there's anything new.
 */
export async function fetch(repoPath: string): Promise<GitOperationResult> {
  try {
    await runGit(repoPath, ["fetch", "origin"]);
    return { success: true, message: "Fetched from remote." };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch.";
    return { success: false, message };
  }
}

/**
 * Pulls remote changes and applies them to the local repo.
 *
 * This is fetch + apply in one step. We use it when we know
 * the remote has changes we want.
 */
export async function pull(repoPath: string): Promise<GitOperationResult> {
  try {
    await runGit(repoPath, ["pull", "origin", "main"]);
    return { success: true, message: "Pulled from remote." };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to pull.";
    return { success: false, message };
  }
}

// ─── Checking What's Going On ───────────────────────────────────

/**
 * Gets the current state of the local repository.
 *
 * This answers questions like:
 * - "Are there any unsaved changes?"
 * - "Which files have been modified?"
 * - "Is everything committed and clean?"
 */
export async function status(repoPath: string): Promise<GitStatus> {
  const output = await runGit(repoPath, ["status", "--porcelain"]);

  // git status --porcelain gives us a compact format:
  //   "M  settings.json"  → modified
  //   "?? newfile.json"   → untracked (new)
  //   "A  staged.json"    → staged (added)
  const modifiedFiles: string[] = [];
  const untrackedFiles: string[] = [];
  const stagedFiles: string[] = [];

  // If there's no output, the repo is clean — nothing changed.
  if (!output) {
    return { hasChanges: false, modifiedFiles, untrackedFiles, stagedFiles };
  }

  for (const line of output.split("\n")) {
    // Each line starts with a two-character status code.
    const statusCode = line.substring(0, 2);
    const filePath = line.substring(3);

    if (statusCode === "??") {
      untrackedFiles.push(filePath);
    } else if (statusCode.startsWith("M") || statusCode.startsWith(" M")) {
      modifiedFiles.push(filePath);
    } else if (statusCode.startsWith("A") || statusCode.startsWith("R")) {
      stagedFiles.push(filePath);
    }
  }

  return {
    hasChanges: true,
    modifiedFiles,
    untrackedFiles,
    stagedFiles,
  };
}

/**
 * Gets the latest commit hash from our local copy.
 * Returns an empty string if there are no commits yet (brand new repo).
 */
export async function getLocalHead(repoPath: string): Promise<string> {
  try {
    return await runGit(repoPath, ["rev-parse", "HEAD"]);
  } catch {
    // No commits yet — that's fine for a brand new repo.
    return "";
  }
}

/**
 * Gets the latest commit hash from the remote (GitHub).
 * We compare this to getLocalHead to see if there are new changes to pull.
 *
 * Important: You need to call fetch() first to make sure we have
 * the latest info about the remote. Otherwise this might return stale data.
 */
export async function getRemoteHead(repoPath: string): Promise<string> {
  try {
    return await runGit(repoPath, ["rev-parse", "origin/main"]);
  } catch {
    // Remote doesn't exist yet, or no commits on remote.
    return "";
  }
}

/**
 * Compares local and remote heads to see who's ahead.
 *
 * This is the quick check we do before deciding whether to
 * pull, push, or do nothing. It's just comparing two strings —
 * very fast, no data transfer.
 */
export async function compareHeads(repoPath: string): Promise<HeadComparison> {
  const localHead = await getLocalHead(repoPath);
  const remoteHead = await getRemoteHead(repoPath);

  return {
    localHead,
    remoteHead,
    inSync: localHead === remoteHead && localHead !== "",
  };
}

// ─── Repository Cloning ─────────────────────────────────────────

/**
 * Clones an existing remote repository to a local path.
 * This is used when Device 2 joins an existing sync —
 * it downloads the full history from GitHub.
 */
export async function clone(remoteUrl: string, localPath: string): Promise<GitOperationResult> {
  try {
    // We use execFileAsync directly here because clone runs
    // OUTSIDE an existing repo (it creates one).
    await execFileAsync("git", ["clone", remoteUrl, localPath], {
      timeout: 60_000, // Cloning can take a minute depending on repo size.
    });
    return { success: true, message: `Cloned ${remoteUrl} to ${localPath}` };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to clone repository.";
    return { success: false, message };
  }
}

// ─── Utilities ──────────────────────────────────────────────────

/**
 * Checks if Git is installed and accessible on this machine.
 *
 * We call this on startup. If Git isn't installed, there's no point
 * in trying anything else — we show a friendly message asking
 * the user to install it.
 */
export async function isGitInstalled(): Promise<boolean> {
  try {
    await execFileAsync("git", ["--version"]);
    return true;
  } catch {
    return false;
  }
}
