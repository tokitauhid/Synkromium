/**
 * allowlist.ts — The bouncer at the door.
 *
 * This module enforces a strict "guest list" for files.
 * Only files that are explicitly on the allowlist get synced.
 * Everything else is ignored, no matter what.
 *
 * Why an allowlist instead of a blocklist?
 * Because it's safer to say "only sync THESE files" than
 * "sync everything EXCEPT these files." You can't accidentally
 * leak something you never allowed in the first place.
 *
 * Implementation comes in Step 5.
 */
