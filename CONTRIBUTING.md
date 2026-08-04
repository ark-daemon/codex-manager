# Contributing to Relay

Thanks for your interest in improving Relay. This is a community-driven, open-source project and contributions of all kinds are welcome: bug reports, feature ideas, docs, and code.

## Ways to contribute

- **Report a bug** — Open an issue with clear reproduction steps, your OS + version, and what you expected to happen.
- **Suggest a feature** — Open an issue describing the use case. Explain the problem before the solution.
- **Improve docs** — Typos, unclear instructions, and missing setup steps are all fair game.
- **Submit code** — Fix a bug or build a feature. For anything non-trivial, open an issue first so we can align on approach before you invest the time.

## Development setup

```bash
# Clone your fork
git clone https://github.com/<your-username>/codex-manager.git
cd codex-manager

# Install dependencies
npm install

# Run the test suite
npm test

# Launch the app in development (TypeScript build + Electron)
npm start
```

### Project layout

- `electron/` — Electron main process, IPC, and platform services (crypto, profiles, usage polling, process management).
- `src/` — React renderer (SPA), shared types, and UI utilities.
- `tests/` — Vitest unit and integration suites.
- `scripts/` — Build and asset-generation helpers.

See the **Repository map** in the [README](./README.md) for a full breakdown.

## Before you open a pull request

1. **Tests pass** — Run `npm test` and make sure the full suite is green. Add tests for new behavior.
2. **Types check** — The project is strict TypeScript. No `any` escapes unless there's a documented reason.
3. **Keep security invariants intact** — Auth material is *never* written as plaintext, `contextIsolation` stays on, and IPC handlers stay behind the trusted-sender guard. If a change touches the crypto, auth storage, or IPC surface, call it out explicitly in the PR description.
4. **Small, focused commits** — One logical change per PR where possible. It makes review faster and reverts cleaner.
5. **Describe the change** — What, why, and how you tested it. Screenshots for UI changes are appreciated.

## Coding conventions

- Match the existing style: service-oriented modules, one concern per file.
- Prefer pure, testable functions for parsing and business logic; keep side effects at the edges.
- No new runtime dependencies without discussion — the app deliberately ships a minimal dependency tree.

## Reporting security issues

Please **do not** open a public issue for security vulnerabilities. Instead, email the maintainer at arkucrypto@gmail.com with details and, if possible, a reproduction. You'll get an acknowledgment as soon as possible.

## Code of conduct

Be respectful, assume good intent, and keep discussion focused on the work. Harassment or hostility of any kind isn't welcome here.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE) that covers this project.
