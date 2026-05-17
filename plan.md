ALWAYS HUMANIZE THE CODE AND COMMENTS
# Git-Backed Cross-Device Sync Extension
## Project Plan v3

---

## 1. Project Vision

A developer-focused synchronization platform that keeps application environments consistent across multiple devices using Git as the transport, storage, and versioning layer.

The goal is to create a system that feels:

- **Seamless** — sync happens invisibly in the background
- **Offline-first** — fully functional without internet access
- **Transparent** — users can inspect exactly what is stored and why
- **Recoverable** — every state is versioned and restorable
- **Privacy-respecting** — users own their data in private repositories
- **Developer-friendly** — plain files, standard Git, no lock-in

Unlike traditional cloud sync services, users retain full ownership of their data through private Git repositories. There is no proprietary server, no vendor lock-in, and no opaque sync protocol.

---

## 2. Core Product Philosophy

This project is NOT just:

> "Sync files with Git"

It is:

> "Serialize application state into portable, mergeable, reproducible data structures and synchronize them safely across devices."

Git is only the synchronization and versioning backend. The real work happens in the **Adapter Layer**, which extracts safe, normalized state from each application and restores it reliably.

This distinction is critical. It means:

- The sync engine never touches raw application internals directly
- Each application has a dedicated, testable, isolated adapter
- Conflicts are resolved at the data structure level, not the file level
- New applications can be added without touching the core engine

---

## 3. High-Level Architecture

```
┌────────────────────────┐
│      Applications      │
│  VSCode / Browser      │
│  Obsidian / Hyprland   │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│     Adapter Layer      │
│  Extract & Restore     │
│  (per-app, isolated)   │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│   Normalized State     │
│   JSON / Metadata      │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│     Sync Engine        │
│  Change Detection      │
│  Loop Prevention       │
│  Conflict Handling     │
│  Secret Scanning       │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│     Git Backend        │
│  GitHub / GitLab       │
│  Private Repository    │
└────────────────────────┘
```

---

## 4. Adapter Contract (Required Interface)

Every adapter MUST implement this TypeScript interface. No exceptions.

```typescript
interface Adapter {
  // Pull sync-safe state out of the application
  extract(): Promise<NormalizedState>;

  // Apply a previously extracted state back to the application
  restore(state: NormalizedState): Promise<void>;

  // Validate state before committing or after restoring
  validate(state: NormalizedState): Promise<ValidationResult>;

  // Return the file paths this adapter watches for changes
  getSyncPaths(): string[];

  // Return the adapter's unique identifier
  getId(): string;

  // Return the schema version this adapter produces
  getSchemaVersion(): number;
}

interface NormalizedState {
  adapterId: string;
  schemaVersion: number;
  extractedAt: string;    // ISO 8601 timestamp
  deviceId: string;
  data: Record<string, unknown>;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

Defining this contract first means every adapter is independently testable, swappable, and debuggable without touching the sync engine.

---

## 5. Adapter Directory

```
adapters/
├── vscode/         ← MVP target
├── firefox/
├── chrome/
├── obsidian/
├── hyprland/
└── neovim/
```

Each adapter is responsible for:

- Extracting only sync-safe state (no binaries, no secrets, no machine-specific paths)
- Converting state into normalized JSON that matches `NormalizedState`
- Ignoring machine-specific files (hardware config, local paths, cache)
- Restoring state safely without corrupting the live application
- Handling application-specific merge logic

---

## 6. MVP Scope

### What the MVP Syncs

- Settings files (JSON, JSONC)
- Themes and color schemes
- Keybindings
- Extension / plugin ID lists (NOT binaries)
- Workspace preferences
- Dotfiles (explicitly allowlisted only)

### What the MVP Does NOT Sync

- Browser history or sessions
- Cookies or authentication tokens
- SQLite databases of any kind
- Cache files or temporary data
- Binary extension files
- Machine-specific hardware configuration
- SSH keys, `.env` files, or secrets of any kind

The MVP targets **VSCode only** on two devices. This validates the full architecture before expanding.

---

## 7. Repository Structure

```
app-sync-config/
├── metadata/
│   ├── devices.json          ← Registry of synced devices
│   ├── schema-version.json   ← Current schema version per adapter
│   └── sync-state.json       ← Last applied commit hash per device
│
├── vscode/
│   ├── settings.json
│   ├── keybindings.json
│   └── extensions.json
│
├── hyprland/
│   ├── hyprland.conf
│   └── hyprpaper.conf
│
├── obsidian/
│   └── settings/
│
└── .gitignore                ← Allowlist-based (see Security)
```

### `devices.json` Example

```json
{
  "devices": [
    { "id": "device-abc123", "name": "Work Laptop", "platform": "linux", "lastSeen": "2024-01-15T10:30:00Z" },
    { "id": "device-def456", "name": "Home Desktop", "platform": "windows", "lastSeen": "2024-01-15T09:00:00Z" }
  ]
}
```

### `sync-state.json` Example

```json
{
  "lastAppliedCommit": "abc123def456",
  "lastSyncAt": "2024-01-15T10:30:00Z",
  "deviceId": "device-abc123"
}
```

This file is the key to preventing infinite sync loops (see Section 11).

---

## 8. Schema Versioning and Migration

Every adapter exports a `schemaVersion` number. When the schema changes, a migration must be written before the new version ships.

```
migrations/
├── vscode/
│   ├── 1-to-2.ts
│   └── 2-to-3.ts
└── ...
```

### Migration Runner

On startup, before any sync:

1. Read `schema-version.json` from the repository
2. Compare against the current adapter's `getSchemaVersion()`
3. If behind, run migrations in order
4. Write the new version back to `schema-version.json` and commit

If a Device A (v2) syncs with Device B (v1), Device B will auto-migrate on next startup before applying changes. Never apply state from a newer schema version without a migration path.

---

## 9. Git Strategy

### Use Native Git CLI for MVP

Do NOT use `isomorphic-git` initially.

**Why:**

- Git CLI is faster, more stable, and better documented
- Easier to debug (`git log`, `git status` work as expected)
- Battle-tested conflict handling
- No pure-JS reimplementation quirks

An abstraction layer (`GitBackend` interface) should wrap all Git CLI calls from day one so that `isomorphic-git`, `libgit2`, or JGit can be swapped in later without touching the sync engine.

```typescript
interface GitBackend {
  init(path: string): Promise<void>;
  add(path: string, files: string[]): Promise<void>;
  commit(path: string, message: string): Promise<string>; // returns commit hash
  push(path: string): Promise<void>;
  fetch(path: string): Promise<void>;
  pull(path: string): Promise<void>;
  getLocalHead(path: string): Promise<string>;
  getRemoteHead(path: string): Promise<string>;
  status(path: string): Promise<GitStatus>;
}
```

---

## 10. Sync Engine Architecture

### 10.1 Push Flow

```
File Change Detected (chokidar)
         ↓
   isSyncing? → YES → discard event
         ↓ NO
   Debounce Queue (5–10 seconds)
         ↓
   Acquire lock (.sync.lock)
         ↓
   Secret Scan (block if triggered)
         ↓
   Adapter.extract()
         ↓
   Adapter.validate()
         ↓
   Checksum comparison (skip if unchanged)
         ↓
   git add → git commit → git push
         ↓
   Update sync-state.json
         ↓
   Release lock
```

### 10.2 Pull Flow

```
Startup / App Focus / Scheduled Poll
             ↓
      Acquire lock
             ↓
      git fetch (lightweight)
             ↓
   Compare remote HEAD to sync-state.json
             ↓ (remote is ahead)
      git pull
             ↓
   Check schema version → migrate if needed
             ↓
   Set isSyncing = true
             ↓
   Adapter.restore()
             ↓
   Adapter.validate()
             ↓
   Set isSyncing = false
             ↓
   Update sync-state.json
             ↓
   Release lock
```

### 10.3 Pull Trigger Strategy

| Trigger | Priority |
|---|---|
| Application startup | Always |
| Application window focus | High — catches cross-device switches |
| Scheduled poll (every 15–30 min) | Fallback only |
| Manual user trigger | Always available |

---

## 11. Preventing Infinite Sync Loops

Without explicit safeguards, the following loop occurs:

```
Pull → File Change → Push → Pull → Push → ...
```

Three complementary safeguards are required. All three must be implemented.

### 11.1 Watcher Suspension Flag

```typescript
let isSyncing = false;

// Before restore
isSyncing = true;
await adapter.restore(state);
isSyncing = false;

// In every file watcher callback
chokidar.watch(paths).on('change', (path) => {
  if (isSyncing) return; // Drop event silently
  debouncedPush();
});
```

### 11.2 Commit Fingerprinting

Before processing a pulled commit, check whether it has already been applied:

```typescript
const syncState = await readSyncState();
if (remoteHead === syncState.lastAppliedCommit) {
  return; // Already applied, skip
}
```

### 11.3 Commit Message Tagging

Tag every automated commit with a machine-readable marker:

```
Auto-sync: vscode settings [device-abc123] [v2]
```

The sync engine ignores its own commits when polling for remote changes.

---

## 12. File Locking

All Git operations must be guarded by a file-based lock to prevent concurrent operations (e.g., startup pull racing with a watcher push).

```typescript
const LOCK_FILE = path.join(repoPath, '.sync.lock');
const LOCK_TIMEOUT_MS = 30_000; // 30 seconds max

async function acquireLock(): Promise<void> {
  const start = Date.now();
  while (await lockExists()) {
    if (Date.now() - start > LOCK_TIMEOUT_MS) {
      // Stale lock — force release and log warning
      await releaseLock();
      break;
    }
    await sleep(500);
  }
  await fs.writeFile(LOCK_FILE, String(process.pid));
}

async function releaseLock(): Promise<void> {
  await fs.unlink(LOCK_FILE).catch(() => {});
}
```

Always release the lock in a `finally` block. Always check for stale locks on startup.

---

## 13. File Watching Strategy

File watching behavior differs significantly across platforms:

| Platform | Common Issues |
|---|---|
| Linux | inotify limits, atomic saves via temp file rename |
| macOS | FSEvents batching, sandboxed app restrictions |
| Windows | Path length limits, locked files during write |

### Recommended Approach

Use `chokidar` with the following configuration:

```typescript
chokidar.watch(adapter.getSyncPaths(), {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {          // Wait for file to finish writing
    stabilityThreshold: 500,   // ms of no changes before firing
    pollInterval: 100
  },
  atomic: true,                // Handle atomic saves (temp file → rename)
});
```

Additionally:

- **Debounce** all events to 5–10 seconds before triggering a push
- **Checksum comparison** before staging — skip if content unchanged
- **Check `isSyncing` flag** before acting on any event
- **Batch events** within the debounce window into a single commit

---

## 14. Conflict Resolution Strategy

### 14.1 Never Expose Raw Git Conflicts

Users must never see:

```
<<<<<<< HEAD
=======
>>>>>>> main
```

This is a hard requirement. If raw conflicts surface, the UX has failed.

### 14.2 Structured Merge System

JSON configs are parsed into object trees and merged intelligently:

```typescript
interface MergeStrategy {
  merge(local: NormalizedState, remote: NormalizedState): MergeResult;
}

interface MergeResult {
  success: boolean;
  merged?: NormalizedState;
  conflicts?: ConflictDetail[];
}
```

**Merge rules by data type:**

| Config Type | Merge Strategy |
|---|---|
| Flat key-value settings | Last-write-wins per key (by timestamp) |
| Keybindings (array of objects) | Union merge by `command` as key |
| Extension ID list | Union merge (add from both, never remove on merge) |
| Deleted key on one device, modified on other | Prompt user |

Use `json-merge-patch` (RFC 7396) as the base library. Write adapter-specific merge logic on top for arrays.

### 14.3 Conflict UI

Only shown when automatic merge fails:

```
Conflict Detected in VSCode Settings
─────────────────────────────────────
Setting: editor.fontSize

  This Device:   16
  Other Device:  14
  Last synced:   2024-01-14 09:00

[ Keep This Device ] [ Keep Other Device ] [ Review Diff ]
```

- Show the specific key in conflict, not the whole file
- Show the last sync time to help the user orient
- Provide a diff view for complex conflicts
- Offer "Apply to all conflicts" for batch resolution
- All unresolved conflicts block the push until resolved

---

## 15. Restore Verification

After applying a pulled state, verify the restore succeeded.

```typescript
async function verifyRestore(adapter: Adapter, expectedState: NormalizedState): Promise<boolean> {
  const actualState = await adapter.extract();
  const result = await adapter.validate(actualState);

  if (!result.valid) {
    // Roll back to pre-restore snapshot
    await rollbackToSnapshot(adapter);
    logger.error('Restore verification failed:', result.errors);
    return false;
  }

  return true;
}
```

**Restore process:**

1. Snapshot current state before applying (local backup)
2. Apply remote state
3. Extract state back out and validate checksums
4. If validation fails, restore from snapshot and alert user
5. Log all restore outcomes (success or failure)

---

## 16. First-Run Bootstrap

The plan for Device 1 (initial setup) differs from Device 2 (joining an existing sync).

### Device 1 — First Setup

1. Authenticate via GitHub OAuth
2. Create private `app-sync-config` repository via GitHub API
3. Initialize local Git repo
4. Run `adapter.extract()` for each enabled adapter
5. Run secret scan
6. Initial commit and push
7. Write `devices.json` with this device's entry

### Device 2 — Joining Existing Sync

1. Authenticate via GitHub OAuth
2. Detect existing `app-sync-config` repository
3. Clone repository
4. Run schema migration if needed
5. Show user a preview of what will be applied ("Dry-run mode")
6. User confirms → `adapter.restore()` for each adapter
7. Auto-install extensions from `extensions.json` via app API
8. Add Device 2 entry to `devices.json` and push

**Dry-run mode** shows exactly what will change before anything is written. This is mandatory for first-run on Device 2.

---

## 17. Security Model

### 17.1 Allowlist-Based Syncing

Never use a blocklist. Only sync explicitly approved files.

```json
{
  "vscode": {
    "allowlist": [
      "settings.json",
      "keybindings.json",
      "snippets/**/*.json"
    ]
  }
}
```

If a file is not on the allowlist, it is never staged. Period.

### 17.2 Secret Detection (Pre-Commit Gate)

Run before every `git add`. If triggered, block the commit entirely.

Scan for:

- GitHub tokens (`ghp_`, `gho_`, `github_pat_`)
- AWS credentials (`AKIA`, `aws_secret_access_key`)
- Private key headers (`-----BEGIN ... PRIVATE KEY-----`)
- `.env` file contents leaked into config files
- Generic high-entropy strings above a threshold

```typescript
async function scanForSecrets(files: string[]): Promise<ScanResult> {
  // Use `trufflehog` CLI or implement pattern matching
}
```

On detection:

```
⚠ Sensitive data detected in vscode/settings.json

  Matched pattern: GitHub token (ghp_...)
  Line 42: "github.token": "ghp_xxxxxxxxxxxx"

  Sync has been blocked.
  Remove the sensitive value and try again.
```

### 17.3 Repository Privacy

- Always create repositories as **private** via API
- Verify privacy setting before every push
- Alert user if repository visibility has changed to public

### 17.4 Secure Token Storage

| Platform | Storage Mechanism |
|---|---|
| Windows | Windows Credential Manager via `keytar` |
| macOS | macOS Keychain via `keytar` |
| Linux | libsecret / Secret Service via `keytar` |

Use the `keytar` npm package to abstract all three. Never store tokens in plaintext files. Never log tokens. On Linux, warn if no secret service daemon is running and fall back to AES-256 encrypted local file as a last resort.

### 17.5 GPG Commit Signing (Optional)

Allow users to GPG-sign automated commits. Disabled by default, opt-in via settings.

---
### 17.6 Token Permission Scope

Fine-Grained PAT (recommended):
- Repository: app-sync-config only
- Contents: Read and Write
- Metadata: Read (required)
- All other permissions: None

OAuth App (fallback):
- Scope: repo
- Note: grants access to all user repositories.
  Inform users of this trade-off explicitly during setup.

Validate token permissions on first use and on each startup.
If permissions are insufficient, surface a specific error:
"Token is missing Contents: Write permission on app-sync-config."
## 18. Offline-First Support

### 18.1 Offline Push Queue

When a push fails due to no network:

1. Save the commit locally (it is already committed, just not pushed)
2. Record the pending push in `sync-state.json` as `pendingPush: true`
3. On network restoration, retry push automatically
4. If remote has advanced since the queued commit, fetch and merge before pushing

### 18.2 Offline Conflict Recovery

When two devices modify the same file while both offline and then reconnect:

1. Both devices will have diverged histories
2. Detect the divergence via `git fetch` + comparing commit graphs
3. Attempt structured merge (Section 14.2)
4. If merge fails, surface Conflict UI (Section 14.3)
5. Never force-push; always preserve both histories for recovery

---

## 19. Performance Strategy

### 19.1 Avoid Commit Spam

- Debounce changes to 5–10 seconds minimum
- Batch all changes within the debounce window into one commit
- Target one commit per meaningful work session, not one per file change
- For even cleaner history, consider periodic squash (e.g., weekly)

### 19.2 Lightweight Remote Polling

```typescript
// Only fetch full changes if remote has advanced
const remoteHead = await git.getRemoteHead(repoPath);
const localHead = await git.getLocalHead(repoPath);

if (remoteHead === localHead) {
  return; // Nothing to do
}

await git.pull(repoPath);
```

This compares refs (a single network request) before downloading any objects.

### 19.3 Repository Maintenance

Run periodically (e.g., weekly) in the background:

- `git gc` — garbage collection
- Shallow fetch support for large histories
- Optional: squash old commits beyond a configurable history depth

---

## 20. Cross-Platform Considerations

### Linux

- Target: Hyprland, GNOME, KDE, Neovim, Kitty, WezTerm
- Watch for inotify limits with many files (`fs.inotify.max_user_watches`)
- Config paths follow XDG Base Directory spec

### Windows

- Registry-based settings require special adapter handling (export to JSON, do not sync raw registry)
- Path normalization is critical: always store paths in POSIX format in the repository
- File locking during writes is more common; `awaitWriteFinish` in chokidar is essential

### macOS

- `.plist` files require conversion to JSON and back
- Sandboxed apps may not allow direct config access; document known limitations per adapter
- Permission prompts may appear on first run; document this in onboarding

---

## 21. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js + TypeScript | Type safety critical for adapter contract |
| UI Framework | React + TailwindCSS | Tray icon + settings panel + conflict UI |
| Desktop Shell | Electron (MVP) / Tauri (later) | Tauri for smaller binary, later |
| File Watching | chokidar | Industry standard |
| Git Layer | Native Git CLI | Wrapped behind GitBackend interface |
| JSON Merge | json-merge-patch (RFC 7396) | Plus adapter-specific logic |
| Secret Scanning | Pattern matching + entropy checks | Consider trufflehog integration |
| Token Storage | keytar | Abstracts OS credential managers |
| Auth | GitHub OAuth App (`repo` scope only) | GitLab/Gitea support via abstraction layer |

---

## 22. Development Phases

### Phase 1 — Core Infrastructure

Deliverables:

- GitHub OAuth authentication
- Repository creation and initialization
- `GitBackend` abstraction layer wrapping Git CLI
- File locking mechanism
- Secret scanning (pre-commit gate) ← **must be in Phase 1, not deferred**
- Schema versioning and migration runner skeleton
- `sync-state.json` read/write
- Basic push and pull flows (no adapters yet)

---

### Phase 2 — VSCode Adapter + Full Sync Loop

Deliverables:

- VSCode adapter implementing the full `Adapter` interface
- Watcher suspension flag
- Commit fingerprinting
- Debounce and batch push
- Pull on startup and on app focus
- Dry-run mode for first-run on new device
- Extension auto-install via VSCode CLI

---

### Phase 3 — Merge Engine + Conflict Resolution

Deliverables:

- JSON structured merge engine
- Conflict detection per setting key
- Conflict UI (Keep Local / Keep Remote / Review Diff)
- Restore verification with rollback
- Offline queue and retry logic

---

### Phase 4 — UX Polish + Observability

Deliverables:

- System tray icon with sync status (idle / syncing / conflict / error)
- Last synced timestamp display
- Selective sync toggles per adapter category
- Rollback UI (restore from any past commit)
- First-run onboarding flow for Device 2 (with dry-run preview)
- Sync history log

---

### Phase 5 — Additional Adapters

Priority order based on user value and config predictability:

1. Neovim
2. Firefox / Chrome (settings and extensions only, no history)
3. Obsidian
4. Hyprland / other Linux desktop configs
5. Terminal emulators (Kitty, WezTerm, Alacritty)

---

## 23. Known Risks

### High Risk

| Risk | Mitigation |
|---|---|
| Merge conflicts in complex configs | Structured merge engine + per-key conflict UI |
| Secret leakage to GitHub | Pre-commit secret scan; allowlist-based syncing |
| Infinite sync loops | Watcher flag + commit fingerprinting + message tagging |
| File watcher misfires (mid-write commits) | `awaitWriteFinish` in chokidar |
| Restore fails silently | Restore verification with checksum check + rollback |

### Medium Risk

| Risk | Mitigation |
|---|---|
| Repository size growth | Periodic gc and optional squash |
| GitHub API rate limits | Ref-compare before fetch; document limit assumptions |
| Cross-platform path differences | Normalize to POSIX in repo; denormalize on restore |
| keytar unavailable on some Linux setups | Encrypted fallback with clear warning |

### Low Risk

| Risk | Mitigation |
|---|---|
| Git CLI not installed | Detect on startup; prompt to install with instructions |
| Schema version mismatch | Migration runner handles automatically |
| Repository already exists (Device 2 setup) | Detect via GitHub API before attempting creation |

---

## 24. MVP Success Criteria

The MVP is successful when:

- VSCode settings sync reliably between 2 devices with no manual steps
- Extensions auto-install on a new device from the extension ID list
- Offline mode queues changes and syncs on reconnect without data loss
- Infinite sync loops never occur across 1 week of normal use
- No secrets are ever committed to the repository
- Users can roll back to any previous configuration state
- Raw Git conflicts are never exposed to the user

If all of these hold reliably, the architecture is validated and Phase 5 expansion is justified.

---

## 25. The One Rule That Governs Everything

> Never expose Git complexity to the user.

Users should experience:

```
"My setup just follows me automatically."
```

Not:

```
"I am manually resolving Git problems."
```

Every technical decision in this project should be evaluated against this rule.
