# Codex Manager

**Multi-account session multiplexer for OpenAI Codex.**
*Switch between isolated Codex accounts in under two seconds with automatic rate-limit failover and desktop notifications.*

[![Electron](https://img.shields.io/badge/Electron-39.8-47848f?logo=electron)](https://electronjs.org)
[![React](https://img.shields.io/badge/React-19.2-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-7.2-646cff?logo=vite)](https://vitejs.dev)
[![Vitest](https://img.shields.io/badge/Vitest-4.0-6e9f18?logo=vitest)](https://vitest.dev)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

---

## Technical overview

Codex Manager runs as a native desktop application (Electron) that snapshots, encrypts, and hot-swaps the full Codex session directory (`~/.codex`) between accounts. Each profile is a self-contained directory tree holding its own auth tokens, SQLite databases, agent memory, rules, and hooks — fully isolated from every other profile.

The main process runs a decoupled polling loop that queries the ChatGPT usage endpoint once per profile every 20 minutes. Token refresh, quota derivation, and status classification all happen without involving the renderer, keeping memory footprint low and the UI responsive. All auth material is encrypted at rest via the OS-native keychain (DPAPI on Windows, Keychain on macOS, `libsecret` on Linux) with a passphrase-based fallback when a keyring is unavailable.

**No telemetry. No external analytics. Your credentials never leave your machine except to authenticate with OpenAI's own endpoints.**

---

## Security

Security is a first-class design goal, not an afterthought. The threat model assumes a local attacker with filesystem access and a compromised or buggy renderer.

- **Encryption at rest.** Auth tokens are encrypted using the platform's native keychain (Windows DPAPI, macOS Keychain, Linux `libsecret`) via Electron's `safeStorage`. The on-disk format uses a 7-byte ASCII magic prefix (`CMENC1:`) followed by the encrypted buffer.
- **Never plaintext.** When no OS keychain is available (headless Linux, some VMs), auth files are sealed with a session passphrase using AES-256-GCM with a scrypt-derived key (`CMPWD1:` format). If neither keychain nor passphrase is available, writes **fail closed** rather than fall back to plaintext.
- **Fails closed on tampering.** AES-GCM authentication-tag verification throws on any wrong passphrase or modified payload — a mis-keyed file never returns partial plaintext.
- **Hardened renderer.** The renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. The preload script exposes only typed IPC channels via `contextBridge`.
- **IPC origin validation.** Every IPC message is checked against a trusted-sender guard; messages from unexpected origins or frames are rejected before reaching any privileged handler. Navigation and window-open attempts to remote content are blocked.
- **No silent updates.** Auto-updates require explicit user approval before download.
- **Minimal network surface.** The only outbound calls are to `auth.openai.com` (token refresh) and `chatgpt.com` (quota polling). No analytics, crash reporters, or telemetry of any kind.
- **Portable exports are secrets.** Profile exports intentionally contain plain-text auth tokens for cross-machine migration — the user is expected to handle the export file accordingly.

### Reporting a vulnerability

Please do not open a public issue for security vulnerabilities. Email the maintainer at `arkucrypto@gmail.com` with details and a reproduction if possible.

---

## Features

- **Instant account switching** — Backs up the live Codex session into the current profile, restores the target profile's files, writes decrypted auth tokens to `~/.codex`, and relaunches Codex. Typical wall-clock time: 1.5–2 seconds.

- **Profile isolation** — Each profile stores its own copy of `auth.json`, `config.toml`, SQLite databases, agent memory, custom rules, hooks, and plugin config. Shared project state (`state_5.sqlite`) is preserved across switches so your workspaces follow you.

- **Native encryption at rest** — Auth tokens are written with a `CMENC1:` magic prefix and encrypted through Electron's `safeStorage` API. Import/export produces portable JSON bundles with plain-text auth for cross-machine migration.

- **Usage polling & quota visibility** — Polls `chatgpt.com/backend-api/wham/usage` per profile. Parses five-hour, weekly, monthly (enterprise), and credits windows with per-window reset countdowns displayed in the UI.

- **Silent token refresh** — Expired JWT `id_token` claims are detected pre-switch. The refresh token is exchanged at OpenAI's OAuth endpoint (`auth.openai.com/oauth/token`) and the refreshed credentials are persisted back to the encrypted profile store before writing to the live path.

- **Auto-switch engine** — When the active account's quota falls below a configurable threshold (default 10%), the poller selects the highest-quota ready account and triggers a switch automatically. Any exhausted pool (including the new monthly enterprise limit) triggers immediate failover regardless of the primary pool's level.

- **Desktop notifications** — Interactive notifications on Windows and macOS let you switch accounts or open the manager directly from the toast. Linux notifications arrive without action buttons (Electron limitation) but still surface availability alerts.

- **Login flow capture** — Opens the Codex browser login, captures the resulting auth tokens and session files, saves them as a named profile. No manual file copying required.

- **Import / export** — All profiles can be exported as a single versioned JSON bundle and imported on another machine. Tokens are serialized as plain text for portability.

- **Tray integration** — System tray icon with quick-switch menu, quota percentage display, and background service toggle. Runs minimised to tray on close.

- **Dark / light theme** — Follows the OS preference with a manual override in settings.

---

## Cross-platform support

| Platform | Architectures | Status | Notes |
|----------|--------------|--------|-------|
| Windows 10+ | x64 | Full support | NSIS installer + portable `.exe`. MSIX AUMID detection for Windows Store installs. |
| macOS 13+ | x64, arm64 (Apple Silicon) | Supported | DMG distribution. Keychain-backed encryption. Notifications with action buttons. |
| Linux | x64 | Supported | `.deb` + `.tar.gz` packages. Requires `gnome-keyring` or `kwallet` for encrypted auth storage (passphrase fallback otherwise). Notifications without action buttons. |

All platforms share the same codebase — platform-specific logic (process management, path resolution, encryption) is abstracted behind `process.platform` guards with safe cross-platform fallbacks.

### Platform prerequisites

- **Windows**: None (Codex Manager auto-detects Codex MSIX, `AppData`, and `Programs` installs)
- **macOS**: `login` item permissions for auto-start; Keychain access for encryption
- **Linux**: `libsecret-1` runtime for keyring integration (`sudo apt install libsecret-1-0` on Debian/Ubuntu)

---

## Quick start

```bash
# Clone
git clone https://github.com/ark-daemon/codex-manager.git
cd codex-manager

# Install
npm install

# Test
npm test                 # 95 tests across 10 suites

# Develop
npm start                # TypeScript build + Electron launch

# Package
npm run dist             # Windows: NSIS installer + portable .exe
npm run dist:mac         # macOS: DMG
npm run dist:linux       # Linux: deb + tar.gz
```

CI builds run across all three platforms on every push to `main` via GitHub Actions (`.github/workflows/build.yml`). Artifacts are uploaded to the workflow run — no cloud account needed.

---

## Contributing

Contributions are welcome — bug reports, feature ideas, docs, and code. See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, testing expectations, and pull-request guidelines. For anything non-trivial, open an issue first so we can align on approach.

---

## Repository map

```
.
├── .github/
│   └── workflows/
│       └── build.yml              # Multi-platform CI (win + mac + linux)
├── assets/
│   └── icon.png                   # Runtime window icon (256×256 PNG)
├── build/
│   └── icon.ico                   # Windows installer icon (multi-res ICO)
├── electron/
│   ├── main.ts                    # Electron main process — window, tray, IPC, lifecycle
│   ├── preload.cts                # Context bridge (contextIsolation: true)
│   └── services/
│       ├── activeProfileSyncer.ts # Watches live Codex auth changes, syncs to manager
│       ├── authStorage.ts         # CMENC1:-prefixed safeStorage encrypt/decrypt wrapper
│       ├── codexLoginCaptureService.ts  # Browser login flow → profile capture
│       ├── codexProfileMirror.ts  # Writes profiles.json + profiles/ for Codex multi-account
│       ├── filePlan.ts            # Declarative copy/restore engine for session directories
│       ├── notifications.ts       # Desktop notification service with interactive actions
│       ├── paths.ts               # Cross-platform path resolution and app definition
│       ├── processManager.ts      # Process lifecycle — start, stop, detect (ps-list fallback)
│       ├── profileStore.ts        # Profile CRUD, switch orchestration, auto-switch logic
│       ├── settingsStore.ts       # JSON settings persistence with defaults and validation
│       ├── usagePoller.ts         # 20-min polling loop with suspend-on-sleep awareness
│       └── usageService.ts        # Quota fetching, JWT parsing, OAuth token refresh
├── public/
│   └── hamburger-*.png            # Auto-generated icon sizes (16–256px)
├── scripts/
│   ├── copy-assets.mjs            # Post-TSC asset copy
│   ├── generate-icon.cjs          # Pure-JS ICO/PNG icon generator (no external deps)
│   └── postbuild-electron.mjs     # Post-build finalisation
├── src/
│   ├── App.tsx                    # React SPA — accounts grid, detail panel, settings
│   ├── i18n.ts                    # UI strings (en, zh-cn, ja, ko)
│   ├── styles.css                 # Single-file design system — CSS custom properties, dark theme
│   ├── ui-utils.ts                # Pool rendering, quota color scales, status classification
│   └── shared/
│       ├── types.ts               # Full type definitions — UsageSnapshot, QuotaPool, AppState
│       └── utils.ts               # JWT parsing, email extraction, primary pool selection
├── tests/
│   ├── App.test.tsx               # Renderer integration tests
│   ├── activeProfileSyncer.test.ts
│   ├── authStorage.test.ts        # Encryption/decryption unit tests
│   ├── profileStore.test.ts       # Switch orchestration and file plan integration
│   ├── usagePoller.test.ts        # Poller scheduling and resume behaviour
│   ├── usageService.test.ts       # Quota parsing and token refresh
│   └── ...                        # Additional utility suites
├── package.json
├── tsconfig.json                  # Renderer/Vite TypeScript config
├── tsconfig.electron.json         # Main process TypeScript config (NodeNext)
└── vite.config.ts                 # Vite bundler config for the React SPA
```

---

## Data directory

```
Windows:  %LOCALAPPDATA%\CodexManager\
macOS:    ~/Library/Application Support/CodexManager/
Linux:    ~/.config/CodexManager/
```

Inside: `profiles/` contains one subdirectory per saved account, each with a `codex-agent/` folder mirroring `~/.codex`. The `settings.json` file stores user preferences and the active profile ID. Backups live under `backups/`.

---

## License

[MIT](./LICENSE) © ark-daemon
