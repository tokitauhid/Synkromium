/**
 * watcher.ts — The lookout.
 *
 * This module keeps an eye on your Chromium config files.
 * When something changes (you installed an extension, tweaked
 * a setting), it notices and tells the sync engine.
 *
 * It's smart enough to wait a few seconds before reacting,
 * so rapid-fire changes get bundled into a single sync
 * instead of flooding the system.
 *
 * Implementation comes in Step 9.
 */
