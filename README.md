<div align="center">
  <img src="assets/icon.png" width="96" alt="Codex Manager" />

  # Codex Manager

  **Multi-account session manager for OpenAI Codex CLI**

  [![Release](https://img.shields.io/github/v/release/ark-daemon/codex-manager?style=flat-square)](https://github.com/ark-daemon/codex-manager/releases)
  [![Build](https://img.shields.io/github/actions/workflow/status/ark-daemon/codex-manager/release.yml?style=flat-square&label=Build)](https://github.com/ark-daemon/codex-manager/actions)
  [![Electron](https://img.shields.io/badge/Electron-39-47848f?style=flat-square&logo=electron)](https://electronjs.org)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](./LICENSE)

  [Download](#installation) • [Features](#features) • [Security](#security) • [Development](#development)
</div>

---

Codex Manager is a cross-platform desktop app (Windows, macOS, Linux) that lets you maintain multiple isolated OpenAI Codex accounts and switch between them in under two seconds — without ever touching a config file.

It snapshots, encrypts, and hot-swaps the entire Codex session directory (`~/.codex`) between profiles. Each profile stores its own auth tokens, SQLite databases, agent memory, rules, hooks, and plugin config, fully isolated from every other profile.

> [!NOTE]
> **No telemetry. No analytics. Your credentials never leave your machine** except to authenticate with OpenAI's own endpoints.

## Features

- **Instant switching** — switches the full Codex session between accounts in ~1.5 seconds, including decrypting tokens and relaunching Codex.
- **Usage polling** — polls each account's quota every 20 minutes and shows five-hour, weekly, monthly, and credit windows with reset countdowns.
- **Auto-switch** — when the active account's quota drops below a threshold (default 10%), the engine picks the highest-quota ready account and switches automatically.
- **Silent token refresh** — detects expired JWT `id_token` claims before a switch and refreshes them via OpenAI's OAuth endpoint without interrupting your workflow.
- **Login capture** — opens the Codex browser login flow, captures auth tokens and session files, and saves them as a named profile. No manual file copying.
- **Import / export** — backs up all profiles to a single versioned JSON bundle and restores them on any machine.
- **System tray** — quick-switch menu, quota percentage display, and background service toggle from the tray icon. Runs minimised on close.
- **Desktop notifications** — interactive toasts on Windows and macOS let you switch accounts or open the manager directly from the notification.
- **Dark / light theme** — follows OS preference with a manual override in Settings.

## Installation

Download the latest release for your platform from the [Releases page](https://github.com/ark-daemon/codex-manager/releases):

| Platform | Package |
|----------|---------|
| **Windows** | `Codex Manager Setup x.x.x.exe` (NSIS installer) or portable `.exe` |
| **macOS** | `Codex Manager-x.x.x.dmg` |
| **Linux** | `codex-manager_x.x.x.deb` or `.tar.gz` |

The app checks for updates on launch and prompts before downloading — no silent background updates.

> [!IMPORTANT]
> **Linux users:** `libsecret-1` is required for encrypted auth storage. Install it with `sudo apt install libsecret-1-0` (Debian/Ubuntu) or the equivalent for your distro. A passphrase-based AES-256-GCM fallback is used if no keyring is available.

## Security

Security is a first-class design goal. The threat model assumes a local attacker with filesystem access and a compromised renderer process.

- **Encryption at rest** — auth tokens are encrypted through Electron's `safeStorage` API using the platform's native keychain (Windows DPAPI, macOS Keychain, Linux `libsecret`). The on-disk format uses a `CMENC1:` magic prefix.
- **Passphrase fallback** — when no OS keychain is available, tokens are sealed with AES-256-GCM using a scrypt-derived key (`CMPWD1:` format).
- **Fails closed** — if neither keychain nor passphrase is available, writes fail rather than fall back to plaintext. AES-GCM authentication-tag verification throws on any tampered payload.
- **Hardened renderer** — `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The preload script exposes only typed IPC channels via `contextBridge`. Navigation to remote content is blocked.
- **Minimal network surface** — the only outbound calls are to `auth.openai.com` (token refresh) and `chatgpt.com` (quota polling).

> [!CAUTION]
> Profile exports contain plain-text auth tokens for cross-machine portability. Treat export files as secrets and store them accordingly.

To report a security vulnerability, **do not open a public issue**. Email `arkucrypto@gmail.com` with details and a reproduction.

## Development

**Prerequisites:** Node.js 22+, npm 10+

```bash
# Clone and install
git clone https://github.com/ark-daemon/codex-manager.git
cd codex-manager
npm install

# Run tests (95 tests across 10 suites)
npm test

# Start in development mode (TypeScript build + Electron launch)
npm start

# Package for distribution
npm run dist        # Windows: NSIS installer + portable .exe
npm run dist:mac    # macOS: DMG
npm run dist:linux  # Linux: .deb + .tar.gz
```

CI builds run on all three platforms on every push via GitHub Actions. Tagged releases (`v*`) trigger the release workflow which packages and publishes installers automatically.

### Project structure

```
electron/           # Main process (Node.js / Electron)
├── main.ts         # Window, tray, IPC, app lifecycle
├── preload.cts     # Typed context bridge
└── services/
    ├── authStorage.ts          # safeStorage encrypt/decrypt wrapper
    ├── profileStore.ts         # Profile CRUD, switch orchestration, auto-switch
    ├── usagePoller.ts          # 20-min polling loop
    ├── usageService.ts         # Quota fetching, JWT parsing, token refresh
    ├── codexLoginCaptureService.ts  # Browser login → profile capture
    ├── notifications.ts        # Desktop notification service
    ├── processManager.ts       # Codex process lifecycle
    └── paths.ts                # Cross-platform path resolution
src/                # Renderer process (React + TypeScript)
├── App.tsx         # Accounts grid, settings, state management
├── styles.css      # CSS custom properties, dark / light theme
└── shared/         # Types and utilities shared across processes
tests/              # Vitest test suites (unit + integration)
scripts/            # Icon generation, asset copy, post-build
```

### Data directory

Codex Manager stores profiles and settings in the OS-appropriate location:

```
Windows   %LOCALAPPDATA%\CodexManager\
macOS     ~/Library/Application Support/CodexManager/
Linux     ~/.config/CodexManager/
```
