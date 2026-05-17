/**
 * backend.ts — The Git translator.
 *
 * This module talks to the real `git` command-line tool on your
 * computer. It wraps every Git command (add, commit, push, pull, etc.)
 * in a clean, easy-to-use function.
 *
 * The rest of the app never touches Git directly — it always
 * goes through this module. That way, if we ever need to swap
 * out the Git CLI for something else, we only change this one file.
 *
 * Implementation comes in Step 3.
 */
