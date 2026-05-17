export interface GitStatus {
  hasChanges: boolean;
  modifiedFiles: string[];
  untrackedFiles: string[];
  stagedFiles: string[];
}

export interface CommitResult {
  hash: string;
  message: string;
}

export interface HeadComparison {
  localHead: string;
  remoteHead: string;
  inSync: boolean;
}

/** Wraps success/failure for git operations that can fail gracefully. */
export interface GitOperationResult {
  success: boolean;
  message: string;
}
