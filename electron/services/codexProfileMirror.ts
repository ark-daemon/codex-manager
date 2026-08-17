import fs from "node:fs/promises";
import path from "node:path";
import { EnvPaths, getEnvPaths } from "./paths.js";

export interface CodexAuthTokens {
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  account_id?: string;
}

export interface CodexAccountInfo {
  account_id?: string;
  id?: string;
  email?: string;
  avatar_url?: string;
}

export interface CodexAuthJson {
  auth_mode?: string;
  tokens?: CodexAuthTokens;
  account?: CodexAccountInfo;
  last_refresh?: string;
}

export interface ProfilesIndexEntry {
  id: string;
  label: string;
  email?: string;
  file: string;
  updatedAt: string;
}

export interface ProfilesIndex {
  profiles: ProfilesIndexEntry[];
  version?: number | string;
  activeProfileId?: string;
}

export async function mirrorCodexProfile(authJson: CodexAuthJson, label: string, email?: string, env: EnvPaths = getEnvPaths()): Promise<void> {
  const codexRoot = path.join(env.userProfile, ".codex");
  const profilesRoot = path.join(codexRoot, "profiles");
  const now = new Date().toISOString();
  const id = `${slugify(email ?? label)}-chatgpt`;
  const file = `${id}.json`;

  await fs.mkdir(profilesRoot, { recursive: true });
  await fs.writeFile(path.join(profilesRoot, file), `${JSON.stringify(authJson, null, 2)}\n`, "utf8");

  const indexPath = path.join(codexRoot, "profiles.json");
  const index = await readIndex(indexPath);
  const nextEntry: ProfilesIndexEntry = { id, label, email, file, updatedAt: now };

  // Preserve unknown fields on existing entries so Codex-native metadata (e.g.
  // active flags, avatar URLs, organisation IDs) is not wiped on every switch.
  const existingProfiles = (index.profiles ?? []).filter((entry: ProfilesIndexEntry) =>
    entry.id !== id && entry.email !== email
  );
  const oldEntry = (index.profiles ?? []).find((entry: ProfilesIndexEntry) =>
    entry.id === id || entry.email === email
  );
  const mergedEntry: ProfilesIndexEntry = oldEntry
    ? { ...oldEntry, ...nextEntry, updatedAt: now }
    : nextEntry;
  const profiles = [...existingProfiles, mergedEntry].sort((left, right) => {
    const a = left.label || "";
    const b = right.label || "";
    return a.localeCompare(b);
  });

  // Remove orphaned .json files in profiles/ that are no longer referenced by
  // profiles.json so Codex does not see stale native-account files on restart.
  const referencedFiles = new Set<string>(profiles.map((p: ProfilesIndexEntry) =>
    p.file || ""
  ).filter(Boolean));
  try {
    const entries = await fs.readdir(profilesRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && !referencedFiles.has(entry.name)) {
        await fs.rm(path.join(profilesRoot, entry.name), { force: true });
        console.info(`[CodexProfileMirror] removed unreferenced profile file: ${entry.name}`);
      }
    }
  } catch {
    // Ignore read errors (directory may not exist yet).
  }

  // Preserve unknown top-level fields (e.g. version, activeProfileId) that newer
  // versions of Codex may have added to profiles.json.
  const output: ProfilesIndex = { ...index, profiles };
  await fs.writeFile(indexPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}

async function readIndex(indexPath: string): Promise<ProfilesIndex> {
  try {
    const raw = await fs.readFile(indexPath, "utf8");
    // SAFETY: JSON parsed from disk matches ProfilesIndex structure
    const parsed = JSON.parse(raw) as ProfilesIndex;
    if (parsed && Array.isArray(parsed.profiles)) {
      return parsed;
    }
  } catch {
    // Missing or invalid profile indexes are rebuilt with the new entry.
  }
  return { profiles: [] };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 64) || "codex-profile";
}
