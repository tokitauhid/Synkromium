export const APP_NAME = "Synkromium";
export const APP_VERSION = "0.1.4";

export const SYNC_REPO_NAME = "synkromium-data";
export const SYNC_BRANCH = "main";

// Prefix on automated commits so the sync engine can recognize its own work
export const COMMIT_PREFIX = "synkromium-auto:";

// Wait for rapid-fire writes to settle before syncing
export const DEBOUNCE_DELAY_MS = 7_000;

// Fallback polling interval for remote changes
export const POLL_INTERVAL_MS = 15 * 60 * 1000;

export const LOCK_FILE_NAME = ".sync.lock";
export const LOCK_TIMEOUT_MS = 30_000;
export const LOCK_RETRY_INTERVAL_MS = 500;

// chokidar stability settings for atomic file saves
export const FILE_STABILITY_THRESHOLD_MS = 500;
export const FILE_POLL_INTERVAL_MS = 100;

// Persists in ~ so it survives reinstalls
export const DEVICE_ID_FILENAME = ".synkromium-device-id";

// Anything bigger than this is definitely not a settings file
export const MAX_SYNC_FILE_SIZE_BYTES = 1_048_576;

// GitHub OAuth Device Flow
export const GITHUB_CLIENT_ID = "Ov23liezUm41KqSyBSt2";
export const GITHUB_OAUTH_SCOPE = "repo";
