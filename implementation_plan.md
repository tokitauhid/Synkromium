# Synkromium — Step-by-Step Implementation Plan

> **How this works:** Each step is a tiny, self-contained task. I complete one step, you review it, and we move on. Nothing gets built until you say "go."

---

## Project Structure (What the codebase will look like)

The code is split into small, focused modules so each piece is easy to read, test, and debug on its own.

```
Synkromium/
├── package.json
├── tsconfig.json
├── plan.md                       ← (already exists)
│
├── src/
│   ├── main.ts                   ← Electron main process entry point
│   │
│   ├── config/
│   │   └── constants.ts          ← All app-wide settings in one place
│   │
│   ├── device/
│   │   └── identity.ts           ← "Who is this computer?" — device ID, name, platform
│   │
│   ├── git/
│   │   ├── backend.ts            ← Talks to the real `git` CLI
│   │   └── types.ts              ← Shared Git types
│   │
│   ├── sync/
│   │   ├── engine.ts             ← The brain — coordinates push/pull/merge
│   │   ├── lock.ts               ← Prevents two syncs from running at once
│   │   ├── state.ts              ← Tracks "what was last synced?"
│   │   ├── watcher.ts            ← Watches files for changes
│   │   └── loop-guard.ts         ← Prevents infinite sync loops
│   │
│   ├── adapters/
│   │   ├── base.ts               ← The "contract" every adapter must follow
│   │   └── chromium/
│   │       ├── adapter.ts        ← The Chromium adapter (extract/restore settings)
│   │       ├── paths.ts          ← Where Chromium stores settings on each OS
│   │       └── extensions.ts     ← Read/restore the extension list
│   │
│   ├── security/
│   │   ├── secret-scanner.ts     ← Catches passwords/tokens before they get synced
│   │   └── allowlist.ts          ← "Only sync these specific files, nothing else"
│   │
│   ├── merge/
│   │   ├── json-merge.ts         ← Smart merging for JSON settings
│   │   └── conflict.ts           ← Detects and describes conflicts for the user
│   │
│   └── ui/
│       ├── tray.ts               ← System tray icon (idle / syncing / error)
│       └── renderer/
│           ├── index.html        ← The settings/conflict window
│           ├── styles.css
│           └── app.ts
│
└── tests/                        ← One test file per module
    ├── git-backend.test.ts
    ├── sync-engine.test.ts
    ├── chromium-adapter.test.ts
    └── secret-scanner.test.ts
```

---

## The Steps

### Step 1 — Project Scaffolding
> *"Set up the empty house before we start decorating."*

- Initialize `package.json` with project metadata
- Set up TypeScript (`tsconfig.json`)
- Install core dependencies: `typescript`, `electron`, `chokidar`
- Create the folder structure shown above (empty files with descriptive header comments)
- Add a simple `npm run build` and `npm run dev` script

**You'll review:** The folder layout, dependencies, and config files.

---

### Step 2 — Constants & Device Identity
> *"Before syncing anything, we need to know WHO this computer is."*

- `src/config/constants.ts` — App name, default sync interval, repo name, etc.
- `src/device/identity.ts` — Generate a unique device ID, detect OS, give the device a human-readable name

**You'll review:** A small, readable module that answers "What computer am I?"

---

### Step 3 — Git Backend
> *"Teach the app how to talk to Git."*

- `src/git/types.ts` — Simple types for Git status, commit results, etc.
- `src/git/backend.ts` — A clean wrapper around `git` CLI commands: `init`, `add`, `commit`, `push`, `pull`, `fetch`, `status`, `getHead`
- Each function is small, well-commented, and runs a single Git command

**You'll review:** A module that can run Git commands. No sync logic yet — just the plumbing.

---

### Step 4 — Sync Lock & State Tracker
> *"Make sure two syncs never step on each other's toes."*

- `src/sync/lock.ts` — A file-based lock so only one sync runs at a time (with stale lock detection)
- `src/sync/state.ts` — Read/write `sync-state.json` to track the last synced commit, timestamp, and device

**You'll review:** Two tiny modules that keep sync safe and trackable.

---

### Step 5 — Security: Allowlist & Secret Scanner
> *"Before we ever sync a single file, make sure we can't leak secrets."*

- `src/security/allowlist.ts` — Only sync files that are explicitly approved (whitelist approach)
- `src/security/secret-scanner.ts` — Scan file contents for patterns like API keys, tokens, passwords. Block the sync if anything is found.

**You'll review:** The safety net. This is the module that protects the user.

---

### Step 6 — Adapter Contract (Base Interface)
> *"Define what every adapter MUST be able to do."*

- `src/adapters/base.ts` — The `Adapter` interface: `extract()`, `restore()`, `validate()`, `getSyncPaths()`, `getId()`, `getSchemaVersion()`
- Also defines `NormalizedState` and `ValidationResult` to keep it strongly typed.

**You'll review:** A single file that is the "rulebook" for all adapters.

---

### Step 7 — Chromium Adapter: Paths & Settings
> *"Teach the app where Chromium keeps its settings on this computer."*

- `src/adapters/chromium/paths.ts` — Detect Chromium config paths per OS (Linux, macOS, Windows)
- `src/adapters/chromium/adapter.ts` — Implement `extract()` and `restore()` for Chromium's `Preferences` and `Secure Preferences` JSON files
- Focus on regular settings only (extensions come next)

**You'll review:** The app can now read and write Chromium settings.

---

### Step 8 — Chromium Adapter: Extensions
> *"Sync the list of browser extensions (not the extensions themselves, just the list)."*

- `src/adapters/chromium/extensions.ts` — Extract installed extension IDs and metadata from Chromium's profile
- Integrate into the adapter's `extract()` and `restore()` methods

**You'll review:** The app now knows what extensions you have installed.

---

### Step 9 — File Watcher & Loop Guard
> *"Watch for changes, but don't go in circles."*

- `src/sync/watcher.ts` — Watch the Chromium config files using `chokidar`, debounce changes
- `src/sync/loop-guard.ts` — The `isSyncing` flag + commit fingerprinting to prevent push→pull→push loops

**You'll review:** The app can detect file changes without triggering infinite syncs.

---

### Step 10 — Sync Engine (The Brain)
> *"Wire everything together into a working sync loop."*

- `src/sync/engine.ts` — Orchestrates the full flow:
  - **Push:** Change detected → lock → secret scan → extract → validate → git add/commit/push → unlock
  - **Pull:** Startup/poll → lock → fetch → compare heads → pull → restore → validate → unlock
- Uses every module built so far

**You'll review:** The complete sync flow, end to end.

---

### Step 11 — JSON Merge & Conflict Resolution
> *"When two computers disagree, figure it out gracefully."*

- `src/merge/json-merge.ts` — Merge two JSON settings files key-by-key (last-write-wins per key)
- `src/merge/conflict.ts` — Detect unresolvable conflicts and describe them in plain English for the user

**You'll review:** The peacekeeper module.

---

### Step 12 — Electron Shell & Tray UI
> *"Give the app a face."*

- `src/main.ts` — Electron main process: starts the sync engine, creates the tray icon
- `src/ui/tray.ts` — System tray icon with status (idle / syncing / error / conflict)
- `src/ui/renderer/` — A simple settings window for first-run setup, sync status, and conflict resolution

**You'll review:** A working desktop app you can actually run.

---

## Summary

| Step | What it builds | Size |
|------|---------------|------|
| 1 | Empty project with structure | ~5 files |
| 2 | Constants + Device ID | 2 files |
| 3 | Git CLI wrapper | 2 files |
| 4 | Sync lock + state tracker | 2 files |
| 5 | Allowlist + secret scanner | 2 files |
| 6 | Adapter interface | 1 file |
| 7 | Chromium settings adapter | 2 files |
| 8 | Chromium extensions | 1 file |
| 9 | File watcher + loop guard | 2 files |
| 10 | Sync engine | 1 file |
| 11 | JSON merge + conflicts | 2 files |
| 12 | Electron app + tray UI | ~4 files |

> [!IMPORTANT]
> **Every single file** will have clear, human-readable comments explaining *why* the code exists — not just *what* it does. No cryptic variable names, no clever tricks. Code that a stranger could read and understand.

---

## Open Questions

1. **Which Chromium browser first?** Google Chrome, Chromium, Brave, Edge? They all use Chromium under the hood but store settings in slightly different paths. I'd suggest starting with Google Chrome since it's most common.
2. **GitHub auth method?** The plan mentions OAuth, but for an MVP, a simple Personal Access Token (PAT) pasted by the user might be simpler. Want to start with PAT and add OAuth later?
3. **Do you want tests from the start?** I can write simple tests alongside each step, or we can add them after the core is working.
