import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

// Cache so PowerShell is invoked at most once per process lifetime.
let _msixAumidCache: string | null | undefined = undefined;
const require = createRequire(import.meta.url);

export interface EnvPaths {
  /** Platform appData base directory (without `Codex` suffix). */
  appData: string;
  /** Windows-only Local AppData base directory (or appData on non-Windows). */
  localAppData: string;
  /** User home directory. */
  userProfile: string;
}

export interface AppDefinition {
  displayName: string;
  processNames: string[];
  sourceRoots: SourceRoot[];
  defaultExecutablePath: string;
  /**
   * Windows MSIX Application User Model ID (PackageFamilyName!AppId).
   * When present, the process manager launches via
   * `shell:AppsFolder\<msixAumid>` (equivalent to clicking the app in Start
   * Menu) instead of directly executing the binary.  This is required for
   * MSIX-packaged apps because their binaries live in the protected
   * WindowsApps directory and cannot be executed directly.
   */
  msixAumid?: string;
}

export interface SourceRoot {
  key: string;
  livePath: string;
  profileFolder: string;
  includes: string[];
  /**
   * Entries in `includes` that contain strictly per-account data.
   * When the target profile has no saved copy of one of these files,
   * the live file is DELETED (rather than left in place) so Codex
   * does not show the previous account's data.  Codex will create
   * a fresh, empty file on its next startup.
   */
  clearOnSwitch?: string[];
}

export function getEnvPaths(env: NodeJS.ProcessEnv = process.env): EnvPaths {
  const userProfile = resolveHomeDirectory(env);
  const appData = resolveAppDataBase(env, userProfile);
  return {
    appData,
    localAppData: resolveLocalAppDataBase(env, userProfile, appData),
    userProfile
  };
}

export function getAppDefinition(env: EnvPaths = getEnvPaths()): AppDefinition {
  const defaultExecutablePath = detectCodexExecutablePath(env);
  const msixAumid = process.platform === "win32" ? detectCodexMsixAumid() : undefined;
  return {
    displayName: "Codex",
    processNames: getCodexProcessNames(),
    defaultExecutablePath,
    msixAumid,
    sourceRoots: [
      {
        // All real Codex account data lives in ~/.codex.
        // ARCHITECTURE NOTE (confirmed by WAL forensics):
        //
        // state_5.sqlite, goals_1.sqlite, and sessions/ are ALL SHARED across
        // accounts on this machine.  The threads table has NO user_id column;
        // all conversations from every account are stored in one database.
        // Sessions are identified by UUID-named .jsonl files that never move.
        // Swapping these databases between profiles destroys the conversation
        // history that belongs to the other account.
        //
        // What IS per-account:
        //   auth.json           — the active account's auth tokens
        //   profiles/           — Codex's own multi-account token store
        //   profiles.json       — manifest of Codex's native accounts
        //   config.toml         — per-account preferences / model choice
        //   cap_sid             — session capability token
        //   .codex-global-state.json — per-account UI state (theme, settings)
        //   memories/rules/agents/hooks — per-account personalisation
        //
        // What is SHARED (never swap):
        //   state_5.sqlite*     — all-accounts conversation index (no user_id)
        //   goals_1.sqlite*     — goals/tasks, shared
        //   logs_2.sqlite*      — diagnostic log, shared
        //   sessions/           — UUID-named immutable content files, shared
        //   archived_sessions/  — same as sessions/
        //   session_index.jsonl — index of all sessions, shared
        //   cache/              — cloud-fetched GPT connectors
        //   models_cache.json   — cloud-fetched model list
        //   installation_id     — machine identity
        //   version.json        — app version
        key: "agent",
        livePath: path.join(env.userProfile, ".codex"),
        profileFolder: "codex-agent",
        includes: [
          // ── Auth / identity (strictly per-account) ───────────────────────
          "auth.json",       // active account auth tokens
          "config.toml",     // per-account Codex preferences / model choice
          "cap_sid",         // session capability token

          // ── Codex's own built-in multi-account store ──────────────────────
          // profiles/ has one <email>-chatgpt.json per account (auth tokens).
          // profiles.json is the manifest / index of those accounts.
          // Swapping both ensures Codex's native account-switcher is correct.
          "profiles",
          "profiles.json",

          // ── Personalisation (per-account) ─────────────────────────────────
          "memories",
          "rules",
          "agents",
          "hooks",
          "hooks.json",
          "AGENTS.md",

          // ── UI state / settings ───────────────────────────────────────────
          ".codex-global-state.json",
          ".codex-global-state.json.bak"

          // ── NOT included — shared across all accounts ─────────────────────
          //   state_5.sqlite*     — threads table has NO user_id; all-accounts DB
          //   goals_1.sqlite*     — shared goals/tasks DB
          //   logs_2.sqlite*      — diagnostic log
          //   sessions/           — UUID-named content files, shared pool
          //   session_index.jsonl — shared index
          //   cache/              — cloud-fetched
          //   models_cache.json   — cloud-fetched
          //   installation_id     — machine identity
        ],

        // Per-account files that must be cleared if the target profile has no
        // saved copy (prevents the previous account's identity leaking through).
        // Shared databases (state_5, goals_1, sessions) are NOT listed here —
        // they persist across switches intact.
        clearOnSwitch: [
          "auth.json",
          "profiles", "profiles.json",
          "cap_sid"
        ]
      }

    ]
  };
}


export function getDefaultExecutablePath(env: EnvPaths = getEnvPaths()): string {
  return getAppDefinition(env).defaultExecutablePath;
}

export function getCodexExecutableCandidates(env: EnvPaths = getEnvPaths()): string[] {
  if (process.platform === "win32") {
    return [
      path.join(env.localAppData, "Programs", "Codex", "Codex.exe"),
      path.join(env.localAppData, "Codex", "Codex.exe"),
      path.join(env.localAppData, "Programs", "OpenAI Codex", "Codex.exe"),
      ...discoverOpenAICodexBinExecutables(env),
      path.join(env.appData, "Codex", "Codex.exe"),
      path.join(env.localAppData, "Microsoft", "WindowsApps", "Codex.exe")
    ];
  }

  if (process.platform === "darwin") {
    return [
      "/Applications/Codex.app/Contents/MacOS/Codex",
      path.join(env.userProfile, "Applications", "Codex.app", "Contents", "MacOS", "Codex"),
      path.join(env.userProfile, ".local", "bin", "codex"),
      "/usr/local/bin/codex",
      "/opt/homebrew/bin/codex",
      "/usr/bin/codex"
    ];
  }

  return [
    path.join(env.userProfile, ".local", "bin", "codex"),
    "/usr/local/bin/codex",
    "/usr/bin/codex",
    "/snap/bin/codex",
    "/opt/codex/codex"
  ];
}

function detectCodexExecutablePath(env: EnvPaths): string {
  const candidates = getCodexExecutableCandidates(env);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

/**
 * Detect if Codex is installed as an MSIX/Store package and return its AUMID.
 * Result is cached so PowerShell is only invoked once per process lifetime.
 * Returns undefined if Codex is not installed as MSIX or if detection fails.
 */
function detectCodexMsixAumid(): string | undefined {
  if (_msixAumidCache !== undefined) {
    return _msixAumidCache ?? undefined;
  }
  try {
    const pfn = execFileSync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-Command",
      "Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty PackageFamilyName -First 1"
    ], { encoding: "utf8", timeout: 10_000 }).trim();

    if (pfn) {
      const aumid = `${pfn}!App`;
      console.info(`[Paths] Detected Codex MSIX package: ${aumid}`);
      _msixAumidCache = aumid;
      return aumid;
    }
  } catch (error) {
    console.warn(`[Paths] MSIX detection failed (non-MSIX install assumed): ${error}`);
  }
  _msixAumidCache = null; // null = "checked, not found"
  return undefined;
}

function discoverOpenAICodexBinExecutables(env: EnvPaths): string[] {
  const binRoot = path.join(env.localAppData, "OpenAI", "Codex", "bin");
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(binRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(binRoot, entry.name, "codex.exe"))
    .filter((candidate) => fs.existsSync(candidate))
    .sort((left, right) => {
      try {
        return fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs;
      } catch {
        return 0;
      }
    });
}

function getCodexProcessNames(): string[] {
  if (process.platform === "win32") {
    return ["Codex.exe", "codex.exe"];
  }
  return ["Codex", "codex"];
}

function resolveHomeDirectory(env: NodeJS.ProcessEnv): string {
  return getElectronPath("home")
    ?? env.USERPROFILE
    ?? env.HOME
    ?? os.homedir();
}

function resolveAppDataBase(env: NodeJS.ProcessEnv, homeDir: string): string {
  const fromElectron = getElectronPath("appData");
  if (fromElectron) {
    return fromElectron;
  }
  if (typeof env.APPDATA === "string" && env.APPDATA.trim()) {
    return env.APPDATA;
  }

  if (process.platform === "win32") {
    return path.join(homeDir, "AppData", "Roaming");
  }
  if (process.platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support");
  }
  return path.join(homeDir, ".config");
}

function resolveLocalAppDataBase(env: NodeJS.ProcessEnv, homeDir: string, appDataBase: string): string {
  if (process.platform !== "win32") {
    return appDataBase;
  }

  const fromEnv = env.LOCALAPPDATA;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv;
  }
  return path.join(homeDir, "AppData", "Local");
}

function getElectronPath(name: "home" | "appData"): string | undefined {
  try {
    const electron = require("electron") as { app?: { getPath: (pathName: "home" | "appData") => string } };
    return electron.app?.getPath(name);
  } catch {
    return undefined;
  }
}
