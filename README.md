<p align="center">
  <img src="assets/Synkromium_logo.svg" alt="Synkromium Logo" width="128" />
  <h1 align="center">Synkromium</h1>
  <p align="center">
    <strong>Your browser, everywhere.</strong>
    <br />
    Keep your Chromium browser settings and extensions in sync across all your devices — privately, automatically, and powered by Git.
    <br />
    <br />
    <a href="#-quick-start"><strong>Quick Start »</strong></a>
    &nbsp;&nbsp;·&nbsp;&nbsp;
    <a href="https://github.com/tokitauhid/Synkromium/issues">Report Bug</a>
    &nbsp;&nbsp;·&nbsp;&nbsp;
    <a href="https://github.com/tokitauhid/Synkromium/issues">Request Feature</a>
  </p>
</p>

> [!WARNING]
> **🚧 EARLY BETA** — Core features work, but expect rough edges. **Back up your browser profile** before using Synkromium on your daily driver.

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/version-0.1.4-blue?style=flat-square" alt="Version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" /></a>
  <a href="#"><img src="https://img.shields.io/badge/electron-42-blueviolet?style=flat-square" alt="Electron" /></a>
  <a href="#"><img src="https://img.shields.io/badge/typescript-6.0-blue?style=flat-square" alt="TypeScript" /></a>
  <a href="#"><img src="https://img.shields.io/badge/platform-linux%20%7C%20macOS%20%7C%20windows-lightgrey?style=flat-square" alt="Platform" /></a>
</p>

---

## 💡 Why Synkromium?

You use Chrome on your laptop and desktop. You want your settings, extensions, and bookmarks consistent everywhere — but syncing through Google means handing your data to a third party.

**Synkromium gives you the sync without the surveillance.** It uses a private Git repository as the transport layer. Your data stays in a repo you own.

| Traditional Sync | Synkromium |
|---|---|
| ☁️ Data on vendor servers | 🔒 Data in your private Git repo |
| 🔍 Vendor can read your data | 🙈 Only you have access |
| 🚫 No version history | 📜 Full Git history |
| ⛓️ Locked to one browser | 🌐 Chrome, Brave, Edge, Chromium, Helium |

---

## ✨ Features

- **🔄 Auto Sync** — Detects settings changes in real time and syncs in the background
- **🌐 Multi-Browser** — Chrome, Brave, Edge, Chromium, Helium
- **🔌 Extensions** — Syncs your installed extension list (IDs and metadata, not binaries)
- **📑 Bookmarks** — Keeps bookmarks consistent across devices
- **🔒 Private** — All data lives in your own private Git repository
- **🛡️ Secret Scanner** — Blocks commits containing API keys, tokens, or passwords
- **📋 Allowlist** — Only explicitly approved files are ever synced
- **📴 Offline-First** — Commits locally, pushes when connectivity returns
- **🔁 Loop Prevention** — Three layers of safeguards prevent infinite sync cycles
- **📌 System Tray** — Lives quietly in your taskbar with real-time status

---

## ⚙️ How It Works

```
 Browser (Chrome/Brave/Edge)     reads/writes settings files
          ↕
 Adapter Layer                   extracts & restores per-browser
          ↕
 Sync Engine                     validates, scans, locks, debounces
          ↕
 Git Backend                     commit & push/pull to your private repo
```

**Push:** file change → debounce → lock → extract → validate → allowlist → secret scan → commit → push → unlock

**Pull:** fetch → compare heads → pull → pause watcher → restore → validate → resume → unlock

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Git](https://git-scm.com/) in your PATH
- A GitHub account with a [Fine-grained PAT](https://github.com/settings/tokens?type=beta) (`Contents: Read & Write`)

### Install & Run

```bash
git clone https://github.com/tokitauhid/Synkromium.git
cd Synkromium
npm install
npm run dev
```

**Native Linux install** (any distro — installs to `/opt/Synkromium` with desktop entry):
```bash
bash install.sh
```

### First Run

1. **GitHub Setup** — Enter username, PAT, and repo name
2. **Browser** — Choose which Chromium browser to sync
3. **Test Connection** — Verify credentials
4. Once configured, Synkromium minimizes to your system tray

> **⚠️** Synkromium stores your PAT in `~/.synkromium/settings.json`. OS keychain integration is planned.

### Generating a GitHub PAT

1. Go to **GitHub → Settings → Developer Settings → Fine-grained Personal Access Tokens**
2. Click **"Generate new token"**
3. Scope it to your sync repo (e.g., `synkromium-data`)
4. Grant **"Contents: Read and Write"**
5. Paste the token into Synkromium's GitHub Setup page

---

## 🔐 Security

| ✅ Synced | ❌ Never Synced |
|----------|----------------|
| Browser preferences (JSON) | History, cookies, sessions |
| Extension IDs and metadata | Passwords or saved credentials |
| Bookmarks | SQLite databases, cache |

**Pre-commit scanner** catches GitHub/AWS/Google tokens, private keys, passwords, and env variable leaks. If anything is flagged, the sync is blocked entirely.

**Allowlist enforcement** — Only `Preferences`, `Secure Preferences`, and `Bookmarks` are ever synced. Everything else is silently ignored.

**Electron sandboxing** — `contextIsolation: true`, `nodeIntegration: false`, typed IPC bridge.

---

## 🛠️ Development

```bash
npm run build          # Full build (main + renderer + assets)
npm run dev            # Build + launch
npm start              # Launch without rebuilding
npm run dist:linux     # Package for Linux (AppImage/deb/rpm)
npm version <semver>   # Bump version across all files
```

### Project Structure

```
src/
├── main.ts               # Electron entry — app lifecycle, tray, window
├── preload.ts            # Secure IPC bridge (contextBridge)
├── config/               # constants.ts, settings.ts
├── device/               # identity.ts — unique device ID
├── git/                  # backend.ts (CLI wrapper), types.ts
├── sync/                 # engine, lock, state, watcher, loop-guard
├── adapters/             # base.ts (interface), chromium/ (adapter, paths, extensions)
├── security/             # secret-scanner.ts, allowlist.ts
├── merge/                # json-merge.ts (3-way), conflict.ts
├── ipc/                  # channels.ts, handlers.ts
└── ui/                   # tray.ts, renderer/ (HTML, CSS, TS)
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js + TypeScript 6 (strict) |
| Desktop | Electron 42 |
| File Watching | chokidar 5 |
| Git | Native CLI (wrapped) |
| UI | Vanilla HTML/CSS/TS, glassmorphic dark theme |

---

## 🗺️ Roadmap

### Done
- [x] Full sync engine with push/pull/offline queue
- [x] Chromium adapter (Chrome, Brave, Edge, Chromium, Helium)
- [x] Secret scanner and allowlist enforcement
- [x] Three-way JSON merge with conflict detection
- [x] Glassmorphic settings UI with system tray
- [x] Secure IPC bridge

### Next
- [ ] GitHub OAuth (replace manual PAT)
- [ ] OS keychain for token storage
- [ ] Conflict resolution UI
- [ ] Extension auto-install suggestions
- [ ] Schema versioning and migrations

### Future
- [ ] Firefox adapter
- [ ] GitLab / Gitea / self-hosted support
- [ ] Multi-profile support
- [ ] Plugin system for community adapters

---

## 🤝 Contributing

1. Fork → Clone → `npm install`
2. Branch: `git checkout -b feature/your-feature`
3. Build: `npm run build`
4. Commit: `feat: add Firefox adapter` ([Conventional Commits](https://www.conventionalcommits.org/))
5. Push → Open PR

### Code Guidelines

- Comments explain *why*, not *what*
- TypeScript strict mode, no `any`
- Constants in `src/config/constants.ts`
- One concern per file

### Adding a New Adapter

1. Create `src/adapters/your-app/`
2. Implement the `Adapter` interface from `src/adapters/base.ts`
3. Add your files to the allowlist in `src/security/allowlist.ts`

---

## ❓ FAQ

<details>
<summary><strong>Is my data safe?</strong></summary>
Yes. Settings are stored in a private Git repo you control. The secret scanner blocks any sync containing tokens or passwords.
</details>

<details>
<summary><strong>Can I use GitLab or a self-hosted server?</strong></summary>
Not yet in the UI, but the Git backend works with any remote. You can manually configure it. First-class support is on the roadmap.
</details>

<details>
<summary><strong>What happens offline?</strong></summary>
Commits are saved locally and pushed when connectivity returns. Nothing is lost.
</details>

<details>
<summary><strong>Does this sync passwords or history?</strong></summary>
No. Only settings, extension lists (IDs only), and bookmarks.
</details>

<details>
<summary><strong>What if two devices change the same setting?</strong></summary>
Three-way merge resolves most conflicts automatically. Same-key conflicts default to the local value — a visual resolution UI is coming.
</details>

<details>
<summary><strong>Can I sync multiple profiles?</strong></summary>
One profile at a time for now. Multi-profile is on the roadmap.
</details>

---

## 📝 License

[MIT](LICENSE)

---

<p align="center">
  <sub>Built with ☕ and TypeScript. No telemetry. No tracking. Just sync.</sub>
</p>
