<div align="center">
  <img src="assets/icon.png" width="96" alt="Relay" />

  # Relay

  **Session manager for ChatGPT Desktop**  
  *Hot-swaps session data in `~/.codex` with encrypted profiles & automatic failover*

  [![Release](https://img.shields.io/github/v/release/ark-daemon/codex-manager?style=flat-square)](https://github.com/ark-daemon/codex-manager/releases)
  [![Build](https://img.shields.io/github/actions/workflow/status/ark-daemon/codex-manager/build.yml?style=flat-square&label=Build)](https://github.com/ark-daemon/codex-manager/actions)
  [![Electron](https://img.shields.io/badge/Electron-39-47848f?style=flat-square&logo=electron)](https://electronjs.org)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](./LICENSE)

  [Download](#installation) • [Features](#features) • [How it works](#how-it-works) • [Security](#security) • [Development](#development)

  <br/>
  <br/>

  <img src="assets/readme.png" width="800" alt="Relay Screenshot" />
</div>

---

Relay is a cross-platform desktop app (Windows, macOS, Linux) for keeping multiple ChatGPT / Codex accounts ready and switching between them in about two seconds, without editing config files by hand.

It encrypts stored credentials, snapshots per-account Codex state under `~/.codex`, and hot-swaps the active profile while closing and relaunching the desktop app cleanly.

> [!NOTE]
> **No telemetry. No analytics.** Credentials stay on your machine except when talking to OpenAI’s own endpoints (`auth.openai.com`, `chatgpt.com`).

## Requirements

- **OpenAI Codex desktop** installed (current Windows Store/MSIX package is still `OpenAI.Codex`; the GUI process is often `ChatGPT.exe`)
- Node.js **22+** only if you build from source

This app manages **Codex agent sessions and quotas**, not general ChatGPT web chat history.

## Installation

Download the latest release for your platform from the [Releases page](https://github.com/ark-daemon/codex-manager/releases):

| Platform | Package |
|----------|---------|
| **Windows** | `Relay Setup x.x.x.exe` (NSIS) or portable `.exe` |
| **macOS** | `Relay-x.x.x.dmg` |
| **Linux** | `relay_x.x.x.deb` or `.tar.gz` |

The app checks for updates on launch and allows manual checks from the Settings page (no silent background updates).

> [!IMPORTANT]
> **Linux:** encrypted auth storage needs `libsecret-1`. Install with `sudo apt install libsecret-1-0` (Debian/Ubuntu) or your distro’s equivalent. If no keyring is available, set a session passphrase (AES-256-GCM) when prompted.

## Features

- **Instant switching:** decrypts the target profile, writes it into `~/.codex`, fully quits ChatGPT/Codex, then relaunches
- **Usage polling:** refreshes each account’s quota on an interval (default 20 minutes) with five-hour, weekly, monthly, and credit windows plus reset countdowns
- **Auto-switch:** when the active account drops below a threshold (default 10%), picks the highest-quota ready account
- **Silent token refresh:** refreshes expired JWT access before a switch when a refresh token is available
- **Login capture:** opens the browser login flow, captures auth + session files, and saves a named profile
- **Import / export:** backup all profiles to a versioned JSON bundle; optional passphrase encryption for the export file
- **System tray:** quick switch, quota summary, and background service toggle; closes to tray by default
- **Desktop notifications:** low-quota and “available again” alerts on Windows and macOS
- **Dark / light theme:** follows the OS with a Settings override

## How it works

Profiles are stored under the Relay data directory (see below). On switch, the app:

1. Closes the desktop shell (`ChatGPT.exe` / `Codex` / helper `codex` processes)
2. Saves the previous account’s managed files back into its profile folder
3. Restores the target profile’s auth, config, personalisation, and related files into `~/.codex`
4. Relaunches the desktop app (on Windows MSIX via the package AUMID)

### Per-account vs shared

| Swapped (per profile) | Left shared on the machine |
|-----------------------|----------------------------|
| `auth.json`, `profiles/`, `profiles.json`, `cap_sid` | Conversation DBs (`state_5.sqlite*`, …) |
| `config.toml`, hooks, rules, agents, memories | `sessions/`, session index |
| Per-account UI state (`.codex-global-state.json`)* | Cache, installation id, model list |

_\* Select global state fields (like recent local projects, workspaces, and active plugins) are merged across accounts so they are always available._

Conversation history is intentionally **not** forked per account: Codex stores threads without a per-user partition in those databases, so swapping them would corrupt other accounts’ history.

## Security

Threat model: a local attacker with filesystem access, and a compromised renderer process.

- **Encryption at rest:** auth files use Electron `safeStorage` (Windows DPAPI, macOS Keychain, Linux libsecret), marked with a `CMENC1:` prefix
- **Passphrase fallback:** if no OS keychain is available, auth is sealed with AES-256-GCM (`CMPWD1:`) using a session passphrase you enter each launch
- **Fails closed:** without keychain or passphrase, credentials are not written as plaintext
- **Hardened renderer:** `contextIsolation`, no Node in the page, `sandbox`, navigation blocked; IPC only accepted from the app’s own frames
- **Minimal network:** `auth.openai.com` (token refresh) and `chatgpt.com` (quota)

> [!CAUTION]
> Export bundles contain account tokens and are **always encrypted** with a passphrase you choose. Treat the file and the passphrase like credentials. Legacy plaintext exports (older versions) can still be imported.

To report a vulnerability, **do not open a public issue**. Email `arkucrypto@gmail.com` with details and a reproduction.

## Compatibility

OpenAI renames shell binaries and package layouts occasionally. Relay matches:

- Process names: `ChatGPT`, `Codex`, `codex`
- MSIX package: `OpenAI.Codex` (fallback `OpenAI.ChatGPT` if renamed)
- Session root: `~/.codex`

If a future desktop update changes process names or paths again, switches may fail until Relay is updated. Open an issue with your OS, app version, and process list.

## Development

**Prerequisites:** Node.js 22+, npm 10+

```bash
git clone https://github.com/ark-daemon/codex-manager.git
cd codex-manager
npm install

# Tests (~101 across 11 suites)
npm test

# Build main + renderer, then launch Electron
npm start

# Package
npm run dist        # Windows: NSIS + portable
npm run dist:mac    # macOS: DMG
npm run dist:linux  # Linux: .deb + .tar.gz
```

CI builds installers on every push (`build.yml`). Pushing a `v*` tag runs the release workflow and attaches draft GitHub Release assets.

### Project structure

```
electron/           # Main process
├── main.ts         # Window, tray, IPC, auto-update
├── preload.cts     # Typed context bridge
└── services/       # Profiles, auth, switch, usage, process, paths, …
src/                # React UI (accounts, settings, tray-driven state)
tests/              # Vitest unit + integration suites
scripts/            # Icons, assets, post-build
```

### Data directory

| OS | Path |
|----|------|
| Windows | `%LOCALAPPDATA%\Relay\` |
| macOS | `~/Library/Application Support/Relay/` |
| Linux | `~/.config/Relay/` |

Live Codex session files remain in `~/.codex` (managed on switch; not the same as the Relay store above).
