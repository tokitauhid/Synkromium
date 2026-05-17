/**
 * paths.ts — "Where does Chrome keep its stuff?"
 *
 * Chrome stores settings in different folders depending on your OS:
 * - Linux:   ~/.config/google-chrome/
 * - macOS:   ~/Library/Application Support/Google/Chrome/
 * - Windows: %LOCALAPPDATA%\\Google\\Chrome\\User Data\\
 *
 * This module figures out the right path for the current computer
 * so the rest of the code doesn't have to worry about it.
 *
 * Implementation comes in Step 7.
 */
