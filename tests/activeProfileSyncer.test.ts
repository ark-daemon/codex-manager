import { describe, expect, it, vi } from "vitest";
import { ActiveProfileSyncer } from "../electron/services/activeProfileSyncer.js";

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    profiles: [],
    defaultExecutablePath: "",
    appInfo: { version: "0.1.0", platform: "win32", license: "", storageEncrypted: false },
    settings: {
      activeProfileId: "p1",
      autoSyncCurrentAccount: true,
      syncIntervalMinutes: 5,
      ...overrides
    }
  };
}

describe("ActiveProfileSyncer", () => {
  it("syncs only when enabled, active, and Codex is running", async () => {
    const profileStore = {
      getState: vi.fn(async () => makeState()),
      syncActiveProfileFromLive: vi.fn(async () => makeState()),
      autoSwitchIfNeeded: vi.fn(async () => undefined)
    };
    const processManager = { isRunning: vi.fn(async () => true) };
    const onSynced = vi.fn();
    const syncer = new ActiveProfileSyncer(profileStore as never, processManager as never, onSynced);

    await expect(syncer.syncOnce()).resolves.toBe(true);

    expect(processManager.isRunning).toHaveBeenCalled();
    expect(profileStore.syncActiveProfileFromLive).toHaveBeenCalledTimes(1);
    expect(onSynced).toHaveBeenCalledTimes(1);
  });

  it("skips when Auto Sync is disabled", async () => {
    const profileStore = {
      getState: vi.fn(async () => makeState({ autoSyncCurrentAccount: false })),
      syncActiveProfileFromLive: vi.fn()
    };
    const processManager = { isRunning: vi.fn(async () => true) };
    const syncer = new ActiveProfileSyncer(profileStore as never, processManager as never);

    await expect(syncer.syncOnce()).resolves.toBe(false);

    expect(processManager.isRunning).not.toHaveBeenCalled();
    expect(profileStore.syncActiveProfileFromLive).not.toHaveBeenCalled();
  });

  it("skips when Codex is not running", async () => {
    const profileStore = {
      getState: vi.fn(async () => makeState()),
      syncActiveProfileFromLive: vi.fn()
    };
    const processManager = { isRunning: vi.fn(async () => false) };
    const syncer = new ActiveProfileSyncer(profileStore as never, processManager as never);

    await expect(syncer.syncOnce()).resolves.toBe(false);

    expect(profileStore.syncActiveProfileFromLive).not.toHaveBeenCalled();
  });
});
