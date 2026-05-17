/**
 * secret-scanner.ts — The security guard.
 *
 * Before ANY file gets synced to your Git repo, this module
 * scans it for things that should NEVER leave your computer:
 * - API keys and tokens
 * - Passwords
 * - Private keys
 * - Anything that looks like a secret
 *
 * If it finds something suspicious, it blocks the sync entirely
 * and tells you exactly what it found and where.
 *
 * Better safe than sorry. Always.
 *
 * Implementation comes in Step 5.
 */
