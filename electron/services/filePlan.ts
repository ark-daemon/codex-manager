import fs from "node:fs/promises";
import path from "node:path";
import { AppDefinition, SourceRoot } from "./paths.js";

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyPath(source: string, destination: string): Promise<void> {
  if (!(await pathExists(source))) {
    return;
  }

  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, {
    recursive: true,
    force: true,
    errorOnExist: false,
    verbatimSymlinks: true
  });
}

export async function copyManagedFromLive(definition: AppDefinition, profilePath: string): Promise<void> {
  for (const root of definition.sourceRoots) {
    await copySourceRootFromLive(root, profilePath);
  }
}

export async function restoreManagedToLive(
  definition: AppDefinition,
  profilePath: string,
  excludeFiles?: string[]
): Promise<void> {
  for (const root of definition.sourceRoots) {
    await restoreSourceRootToLive(root, profilePath, excludeFiles);
  }
}

export async function copyManagedLiveToBackup(definition: AppDefinition, backupPath: string): Promise<void> {
  for (const root of definition.sourceRoots) {
    await copySourceRootFromLive(root, backupPath);
  }
}

async function copySourceRootFromLive(root: SourceRoot, profilePath: string): Promise<void> {
  const targetRoot = path.join(profilePath, root.profileFolder);
  await fs.mkdir(targetRoot, { recursive: true });

  for (const relative of root.includes) {
    await copyPath(path.join(root.livePath, relative), path.join(targetRoot, relative));
  }
}

async function restoreSourceRootToLive(
  root: SourceRoot,
  profilePath: string,
  excludeFiles?: string[]
): Promise<void> {
  const storedRoot = path.join(profilePath, root.profileFolder);
  await fs.mkdir(root.livePath, { recursive: true });

  for (const relative of root.includes) {
    // Skip files that the caller will handle explicitly (e.g. auth.json that
    // must be decrypted before writing to Codex's live directory).
    if (excludeFiles?.includes(relative)) {
      continue;
    }

    const source = path.join(storedRoot, relative);
    const destination = path.join(root.livePath, relative);

    if (await pathExists(source)) {
      // Profile has a saved copy — restore it.
      await fs.rm(destination, { recursive: true, force: true });
      await copyPath(source, destination);
    } else if (root.clearOnSwitch?.includes(relative)) {
      // Profile has no saved copy, but this file is account-specific and
      // must be cleared so Codex does not see the previous account's data.
      // Codex will create a fresh, empty database on first run.
      if (await pathExists(destination)) {
        console.info(`[FilePlan] clearing account-specific file with no profile copy: ${relative}`);
        await fs.rm(destination, { recursive: true, force: true });
      }
    }
    // Otherwise: file is not in profile and not in clearOnSwitch — leave the
    // live version intact (e.g. shared files Codex manages itself).
  }

  // After restoring SQLite databases, remove any -shm files we just copied.
  // The SHM (shared-memory WAL index) is process-local state tied to the
  // original process that wrote it.  If a stale SHM is present when a new
  // process opens the database, SQLite may silently discard WAL pages,
  // causing conversations to appear missing even though the WAL is intact.
  // Deleting it here forces SQLite to regenerate a fresh SHM from the WAL
  // header on first open — the standard safe approach after a file copy.
  for (const relative of root.includes) {
    if (relative.endsWith("-shm")) {
      const shmPath = path.join(root.livePath, relative);
      if (await pathExists(shmPath)) {
        await fs.rm(shmPath, { force: true });
        console.info(`[FilePlan] removed stale SHM (SQLite will regenerate): ${relative}`);
      }
    }
  }
}


export async function copyProfileToBackup(profilePath: string, backupPath: string): Promise<void> {
  await fs.rm(backupPath, { recursive: true, force: true });
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.cp(profilePath, backupPath, {
    recursive: true,
    force: true,
    errorOnExist: false,
    verbatimSymlinks: true
  });
}
