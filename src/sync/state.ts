/**
 * state.ts — The memory of the sync engine.
 *
 * This module remembers:
 * - What was the last commit we synced?
 * - When did we last sync?
 * - Which device did the syncing?
 *
 * Without this, the app would re-sync everything every time,
 * or worse, get confused about what's new and what's old.
 *
 * Implementation comes in Step 4.
 */
