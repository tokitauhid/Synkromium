/**
 * constants.ts — The single source of truth for app-wide settings.
 *
 * Every "magic number" or hardcoded string in the app lives here.
 * If you need to change the sync interval, the repo name, or the
 * debounce delay, this is where you look. Nowhere else.
 *
 * Why centralize all of this? Because hunting through 20 files
 * to find where "30000" means "30 seconds" is nobody's idea of fun.
 */

// ─── App Identity ───────────────────────────────────────────────

/** The name users see in notifications, tray menus, and window titles. */
export const APP_NAME = "Synkromium";

/** Current version of the app. Bump this when we ship updates. */
export const APP_VERSION = "0.1.2";

// ─── Git Repository ─────────────────────────────────────────────

/**
 * The name of the private GitHub repo where settings are stored.
 * This gets created automatically on first run.
 */
export const SYNC_REPO_NAME = "synkromium-data";

/** The default Git branch we sync to and from. */
export const SYNC_BRANCH = "main";

/**
 * The prefix we add to every automated commit message.
 * This helps the sync engine recognize its own commits
 * and avoid re-processing them (which would cause loops).
 *
 * Example commit: "synkromium-auto: chromium settings [device-abc123]"
 */
export const COMMIT_PREFIX = "synkromium-auto:";

// ─── Sync Timing ────────────────────────────────────────────────

/**
 * How long to wait after a file change before syncing (in milliseconds).
 *
 * Why wait at all? Because when you change a setting in Chrome,
 * it often writes to the file multiple times in rapid succession.
 * Waiting a few seconds lets all those writes finish before we
 * grab the final result. Otherwise we'd commit half-written files.
 */
export const DEBOUNCE_DELAY_MS = 7_000; // 7 seconds — a nice middle ground

/**
 * How often to check for remote changes when the app is running (in ms).
 * This is the "fallback" poll — most syncs are triggered by app startup
 * or window focus, but this catches anything we might miss.
 */
export const POLL_INTERVAL_MS = 15 * 60 * 1000; // Every 15 minutes

// ─── File Locking ───────────────────────────────────────────────

/**
 * The name of the lock file that prevents two syncs from running at once.
 * This lives inside the sync repo directory.
 */
export const LOCK_FILE_NAME = ".sync.lock";

/**
 * How long to wait for a lock before giving up (in milliseconds).
 * If a lock is older than this, we assume the previous sync crashed
 * and the lock is "stale" — safe to break and take over.
 */
export const LOCK_TIMEOUT_MS = 30_000; // 30 seconds should be plenty

/**
 * How often to re-check if the lock has been released (in milliseconds).
 * We don't want to hammer the filesystem, but we don't want to wait
 * forever either.
 */
export const LOCK_RETRY_INTERVAL_MS = 500; // Check every half second

// ─── File Watching ──────────────────────────────────────────────

/**
 * How long a file must stop changing before we consider it "done" (in ms).
 * This handles the case where apps save files by writing a temp file
 * and then renaming it — we want to wait for the rename to finish.
 */
export const FILE_STABILITY_THRESHOLD_MS = 500;

/**
 * How often to check if a file has stopped changing (in ms).
 * Works together with FILE_STABILITY_THRESHOLD_MS above.
 */
export const FILE_POLL_INTERVAL_MS = 100;

// ─── Device Identity ────────────────────────────────────────────

/**
 * Where we store this device's unique identity file.
 * It lives in the user's home directory so it persists across reinstalls
 * of the app, but stays specific to this machine.
 */
export const DEVICE_ID_FILENAME = ".synkromium-device-id";

// ─── Security ───────────────────────────────────────────────────

/**
 * The maximum file size (in bytes) we'll ever sync.
 * Anything bigger is almost certainly not a settings file —
 * it's probably a cache, a database, or a mistake.
 *
 * 1 MB is generous for JSON config files.
 */
export const MAX_SYNC_FILE_SIZE_BYTES = 1_048_576; // 1 MB
