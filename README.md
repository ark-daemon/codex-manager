<div align="center">
  <img src="assets/icon.png" width="128" alt="Codex Manager Logo">
  <h1>Codex Manager</h1>
  <p><b>Multi-account session multiplexer for OpenAI Codex</b></p>
  <p><i>Switch between isolated Codex accounts in under two seconds with automatic rate-limit failover and desktop notifications.</i></p>

  [![Electron](https://img.shields.io/badge/Electron-39.8-47848f?logo=electron)](https://electronjs.org)
  [![React](https://img.shields.io/badge/React-19.2-61dafb?logo=react)](https://react.dev)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript)](https://www.typescriptlang.org)
  [![Vite](https://img.shields.io/badge/Vite-7.2-646cff?logo=vite)](https://vitejs.dev)
  [![Vitest](https://img.shields.io/badge/Vitest-4.0-6e9f18?logo=vitest)](https://vitest.dev)
  [![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
</div>

---

## ⚡ Features

- **Instant Account Switching:** Backs up your live Codex session into the current profile, restores the target profile's files, writes decrypted auth tokens, and relaunches Codex in under 2 seconds.
- **True Profile Isolation:** Each profile stores its own copy of `auth.json`, `config.toml`, SQLite databases, agent memory, custom rules, hooks, and plugin config. Shared project state (`state_5.sqlite`) is safely preserved across switches so your workspaces follow you.
- **Native Encryption at Rest:** Auth tokens are securely encrypted through Electron's `safeStorage` API using your OS-native keychain. Exported portable JSON bundles ensure cross-machine migration remains straightforward.
- **Usage Polling & Quota Visibility:** Real-time quota tracking. Parses five-hour, weekly, monthly (enterprise), and credit windows with per-window reset countdowns displayed natively in the UI.
- **Silent Token Refresh:** Expired JWT `id_token` claims are detected seamlessly pre-switch. The refresh token is exchanged at OpenAI's OAuth endpoint and credentials are persisted back to the encrypted profile store.
- **Auto-Switch Engine:** Never hit a rate limit again. When the active account's quota falls below a configurable threshold (default 10%), the engine automatically selects the highest-quota account and triggers a switch.
- **Login Flow Capture:** Opens the Codex browser login, captures the resulting auth tokens and session files, and saves them as a named profile. No manual file copying required!

## 🔐 Security Architecture

Security is a first-class design goal. The threat model assumes a local attacker with filesystem access and a compromised or buggy renderer.

- **Encryption at rest:** Auth tokens are encrypted using the platform's native keychain (Windows DPAPI, macOS Keychain, Linux `libsecret`).
- **Never plaintext:** When no OS keychain is available, auth files are sealed with a session passphrase using AES-256-GCM.
- **Fails closed on tampering:** AES-GCM authentication-tag verification throws on any wrong passphrase or modified payload.
- **Hardened renderer:** The renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. The preload script exposes only typed IPC channels.
- **Minimal network surface:** The only outbound calls are to `auth.openai.com` (token refresh) and `chatgpt.com` (quota polling). **No telemetry. No external analytics. Your credentials never leave your machine except to authenticate with OpenAI.**

> **Reporting a vulnerability:** Please do not open a public issue for security vulnerabilities. Email the maintainer at `arkucrypto@gmail.com` with details and a reproduction.

## 💻 Cross-Platform Support

| Platform | Architectures | Status | Notes |
|----------|--------------|--------|-------|
| **Windows 10+** | x64 | Full support | NSIS installer + portable `.exe`. MSIX AUMID detection for Windows Store installs. |
| **macOS 13+** | x64, arm64 (Apple Silicon) | Supported | DMG distribution. Keychain-backed encryption. Notifications with action buttons. |
| **Linux** | x64 | Supported | `.deb` + `.tar.gz` packages. Requires `gnome-keyring` or `kwallet` for encrypted auth storage. |

All platforms share the same codebase—platform-specific logic (process management, path resolution, encryption) is abstracted behind `process.platform` guards with safe cross-platform fallbacks.

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/ark-daemon/codex-manager.git
cd codex-manager

# Install dependencies
npm install

# Run the test suite (95 tests across 10 suites)
npm test

# Start development (TypeScript build + Electron launch)
npm start

# Package for distribution
npm run dist             # Windows: NSIS installer + portable .exe
npm run dist:mac         # macOS: DMG
npm run dist:linux       # Linux: deb + tar.gz
```

CI builds run across all three platforms on every push to `main` via GitHub Actions. Artifacts are automatically uploaded to the workflow run.

## 📁 Data Directory

Codex Manager stores your data securely based on your operating system:

```text
Windows:  %LOCALAPPDATA%\CodexManager\
macOS:    ~/Library/Application Support/CodexManager/
Linux:    ~/.config/CodexManager/
```

Inside this directory: 
- `profiles/` contains one subdirectory per saved account, each mirroring `~/.codex`.
- `settings.json` stores user preferences and the active profile ID.
- Backups live under `backups/`.

## 🤝 Contributing

Contributions are welcome — bug reports, feature ideas, docs, and code. See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, testing expectations, and pull-request guidelines. For anything non-trivial, open an issue first so we can align on approach.

## 📄 License

[MIT](./LICENSE) © ark-daemon
