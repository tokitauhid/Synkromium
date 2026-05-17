/**
 * Prevents sync loops via two mechanisms:
 * 1. Restore flag — pauses file watching during settings writes
 * 2. Commit fingerprinting — skips already-processed commits
 */
export class LoopGuard {
  private restoring: boolean = false;
  private recentCommits: Set<string> = new Set();
  private maxRecentCommits: number = 50;

  beginRestore(): void {
    this.restoring = true;
  }

  endRestore(): void {
    this.restoring = false;
  }

  isRestoring(): boolean {
    return this.restoring;
  }

  markCommitAsProcessed(commitHash: string): void {
    this.recentCommits.add(commitHash);

    if (this.recentCommits.size > this.maxRecentCommits) {
      const oldest = this.recentCommits.values().next().value;
      if (oldest) this.recentCommits.delete(oldest);
    }
  }

  isCommitAlreadyProcessed(commitHash: string): boolean {
    return this.recentCommits.has(commitHash);
  }

  reset(): void {
    this.restoring = false;
    this.recentCommits.clear();
  }
}
