import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyManagedFromLive, restoreManagedToLive } from "../electron/services/filePlan.js";
import { getAppDefinition } from "../electron/services/paths.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "profile-switcher-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("managed file plans", () => {
  it("copies only managed Codex agent files and excludes shared databases", async () => {
    const env = fakeEnv(tempDir);
    const definition = getAppDefinition(env);
    await fs.mkdir(path.join(env.userProfile, ".codex"), { recursive: true });
    await fs.writeFile(path.join(env.userProfile, ".codex", "auth.json"), "{\"token\":\"redacted\"}");
    await fs.writeFile(path.join(env.userProfile, ".codex", "logs_2.sqlite"), "ignored");

    const profilePath = path.join(tempDir, "profile");
    await copyManagedFromLive(definition, profilePath);

    // Agent auth file must be captured
    await expect(fs.readFile(path.join(profilePath, "codex-agent", "auth.json"), "utf8")).resolves.toContain("redacted");
    // Shared database (not in includes list) must NOT be captured
    await expect(fs.access(path.join(profilePath, "codex-agent", "logs_2.sqlite"))).rejects.toThrow();
  });

  it("restores Codex agent files without copying excluded shared databases", async () => {
    const env = fakeEnv(tempDir);
    const definition = getAppDefinition(env);
    const profilePath = path.join(tempDir, "profile");
    await fs.mkdir(path.join(profilePath, "codex-agent"), { recursive: true });
    await fs.writeFile(path.join(profilePath, "codex-agent", "auth.json"), "{\"token\":\"redacted\"}");

    await restoreManagedToLive(definition, profilePath);

    await expect(fs.readFile(path.join(env.userProfile, ".codex", "auth.json"), "utf8")).resolves.toContain("redacted");
  });
});

function fakeEnv(root: string) {
  return {
    appData: path.join(root, "Roaming"),
    localAppData: path.join(root, "Local"),
    userProfile: path.join(root, "User")
  };
}
