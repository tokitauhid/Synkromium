import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitStatus, CommitResult, HeadComparison, GitOperationResult } from "./types.js";

const execFileAsync = promisify(execFile);

async function runGit(repoPath: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: repoPath,
      timeout: 30_000,
    });
    return stdout.trim();
  } catch (error: unknown) {
    const gitError = error as { stderr?: string; message?: string };
    const details = gitError.stderr || gitError.message || "Unknown git error";
    throw new Error(`Git command failed: git ${args.join(" ")}\n${details}`);
  }
}

export async function init(repoPath: string): Promise<GitOperationResult> {
  try {
    await runGit(repoPath, ["init", "--initial-branch", "main"]);
    return { success: true, message: "Repository initialized." };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to initialize repository.";
    return { success: false, message };
  }
}

export async function addRemote(repoPath: string, remoteUrl: string): Promise<GitOperationResult> {
  try {
    await runGit(repoPath, ["remote", "add", "origin", remoteUrl]);
    return { success: true, message: `Remote added: ${remoteUrl}` };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add remote.";
    return { success: false, message };
  }
}

export async function add(repoPath: string, files: string[]): Promise<GitOperationResult> {
  try {
    await runGit(repoPath, ["add", ...files]);
    return { success: true, message: `Staged ${files.length} file(s).` };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to stage files.";
    return { success: false, message };
  }
}

export async function commit(repoPath: string, message: string): Promise<CommitResult> {
  try {
    await runGit(repoPath, ["commit", "-m", message]);
    const hash = await runGit(repoPath, ["rev-parse", "--short", "HEAD"]);
    return { hash, message };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "";
    if (errorMessage.includes("nothing to commit")) {
      return { hash: "", message: "Nothing to commit — everything is already up to date." };
    }
    throw error;
  }
}

export async function push(repoPath: string): Promise<GitOperationResult> {
  try {
    await runGit(repoPath, ["push", "origin", "main"]);
    return { success: true, message: "Pushed to remote." };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to push.";
    return { success: false, message };
  }
}

export async function fetch(repoPath: string): Promise<GitOperationResult> {
  try {
    await runGit(repoPath, ["fetch", "origin"]);
    return { success: true, message: "Fetched from remote." };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch.";
    return { success: false, message };
  }
}

export async function pull(repoPath: string): Promise<GitOperationResult> {
  try {
    await runGit(repoPath, ["pull", "origin", "main"]);
    return { success: true, message: "Pulled from remote." };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to pull.";
    return { success: false, message };
  }
}

export async function status(repoPath: string): Promise<GitStatus> {
  const output = await runGit(repoPath, ["status", "--porcelain"]);

  const modifiedFiles: string[] = [];
  const untrackedFiles: string[] = [];
  const stagedFiles: string[] = [];

  if (!output) {
    return { hasChanges: false, modifiedFiles, untrackedFiles, stagedFiles };
  }

  for (const line of output.split("\n")) {
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

  return { hasChanges: true, modifiedFiles, untrackedFiles, stagedFiles };
}

export async function getLocalHead(repoPath: string): Promise<string> {
  try {
    return await runGit(repoPath, ["rev-parse", "HEAD"]);
  } catch {
    return "";
  }
}

/** Requires fetch() first to have up-to-date remote info. */
export async function getRemoteHead(repoPath: string): Promise<string> {
  try {
    return await runGit(repoPath, ["rev-parse", "origin/main"]);
  } catch {
    return "";
  }
}

export async function compareHeads(repoPath: string): Promise<HeadComparison> {
  const localHead = await getLocalHead(repoPath);
  const remoteHead = await getRemoteHead(repoPath);
  return {
    localHead,
    remoteHead,
    inSync: localHead === remoteHead && localHead !== "",
  };
}

export async function clone(remoteUrl: string, localPath: string): Promise<GitOperationResult> {
  try {
    await execFileAsync("git", ["clone", remoteUrl, localPath], {
      timeout: 60_000,
    });
    return { success: true, message: `Cloned ${remoteUrl} to ${localPath}` };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to clone repository.";
    return { success: false, message };
  }
}

export async function isGitInstalled(): Promise<boolean> {
  try {
    await execFileAsync("git", ["--version"]);
    return true;
  } catch {
    return false;
  }
}
