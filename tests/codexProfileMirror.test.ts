import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mirrorCodexProfile } from "../electron/services/codexProfileMirror.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "profile-switcher-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("Codex profile mirror", () => {
  it("stores an auth copy under .codex/profiles and updates profiles.json", async () => {
    const authJson = {
      auth_mode: "chatgpt" as const,
      tokens: {
        access_token: "access-token",
        refresh_token: "refresh-token"
      },
      last_refresh: "2026-05-17T00:00:00.000Z"
    };

    await mirrorCodexProfile(authJson, "Work", "person@example.com", {
      appData: path.join(tempDir, "Roaming"),
      localAppData: path.join(tempDir, "Local"),
      userProfile: tempDir
    });

    await expect(fs.readFile(path.join(tempDir, ".codex", "profiles", "person-example-com-chatgpt.json"), "utf8")).resolves.toContain("refresh-token");
    const index = JSON.parse(await fs.readFile(path.join(tempDir, ".codex", "profiles.json"), "utf8")) as { profiles: Array<{ email: string; file: string }> };
    expect(index.profiles).toEqual([
      expect.objectContaining({
        email: "person@example.com",
        file: "person-example-com-chatgpt.json"
      })
    ]);
  });
});
