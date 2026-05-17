/**
 * json-merge.ts — The peacekeeper for settings.
 *
 * When two devices change the same settings file, this module
 * figures out how to combine them without losing either side's work.
 *
 * It works key-by-key: if you changed "fontSize" on your laptop
 * and "theme" on your desktop, both changes get kept.
 * Only when both devices change the SAME key does it need help.
 *
 * Implementation comes in Step 11.
 */
