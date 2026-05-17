/**
 * loop-guard.ts — The infinite loop preventer.
 *
 * Here's the nightmare scenario without this module:
 *   Pull new settings → file changes → push those settings →
 *   other device pulls → pushes back → we pull again → forever.
 *
 * This module stops that from ever happening by:
 * 1. Flagging when we're in the middle of applying changes
 *    (so the watcher ignores those file changes)
 * 2. Remembering which commits we already applied
 *    (so we don't re-process our own work)
 *
 * Implementation comes in Step 9.
 */
