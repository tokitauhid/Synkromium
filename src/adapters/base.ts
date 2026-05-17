/**
 * base.ts — The rulebook for adapters.
 *
 * An "adapter" is a translator between Synkromium and a specific
 * application (like Chrome, Brave, or Edge). This file defines
 * what every adapter MUST be able to do:
 *
 * - extract() — Pull settings out of the app
 * - restore() — Put settings back into the app
 * - validate() — Make sure the settings aren't corrupted
 *
 * If a new browser adapter can't do all of these things,
 * it doesn't get to play.
 *
 * Implementation comes in Step 6.
 */
