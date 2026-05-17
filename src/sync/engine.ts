/**
 * engine.ts — The brain of the sync operation.
 *
 * This is the conductor of the orchestra. It coordinates:
 * - Detecting changes and pushing them to your private repo
 * - Pulling changes from the repo and applying them locally
 * - Making sure secrets don't leak, locks are respected,
 *   and sync loops don't happen
 *
 * Every other module is a specialist. This module tells them
 * when to do their job and in what order.
 *
 * Implementation comes in Step 10.
 */
