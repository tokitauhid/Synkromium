import { watch, type FSWatcher } from "chokidar";
import { DEBOUNCE_DELAY_MS, FILE_STABILITY_THRESHOLD_MS, FILE_POLL_INTERVAL_MS } from "../config/constants.js";
import { logger } from "../utils/logger.js";

export type OnChangeCallback = (changedPaths: string[]) => void;

/**
 * Watches browser config files for changes. Debounces rapid-fire writes
 * into a single callback and can be paused during restores to prevent sync loops.
 */
export class FileWatcher {
  private paths: string[];
  private watcher: FSWatcher | null = null;
  private callback: OnChangeCallback | null = null;
  private paused: boolean = false;
  private pendingChanges: Set<string> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(paths: string[]) {
    this.paths = paths;
  }

  onChange(callback: OnChangeCallback): void {
    this.callback = callback;
  }

  start(): void {
    if (this.watcher) return;

    this.watcher = watch(this.paths, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: FILE_STABILITY_THRESHOLD_MS,
        pollInterval: FILE_POLL_INTERVAL_MS,
      },
      atomic: true,
    });

    this.watcher.on("change", (filePath: string) => this.handleFileEvent(filePath));
    this.watcher.on("add", (filePath: string) => this.handleFileEvent(filePath));
    this.watcher.on("error", (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("File watcher error:", message);
    });
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.pendingChanges.clear();
  }

  /** Pause during restores so our own file writes don't trigger a push. */
  pause(): void {
    this.paused = true;
    this.pendingChanges.clear();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  resume(): void {
    this.paused = false;
  }

  isPaused(): boolean {
    return this.paused;
  }

  isWatching(): boolean {
    return this.watcher !== null;
  }

  private handleFileEvent(filePath: string): void {
    if (this.paused) return;

    this.pendingChanges.add(filePath);

    // Reset debounce — batch rapid changes into one sync
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      this.flushChanges();
    }, DEBOUNCE_DELAY_MS);
  }

  private flushChanges(): void {
    if (this.pendingChanges.size === 0 || !this.callback) return;

    const changedPaths = Array.from(this.pendingChanges);
    this.pendingChanges.clear();
    this.debounceTimer = null;
    this.callback(changedPaths);
  }
}
