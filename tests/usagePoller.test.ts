import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const powerMonitor = new EventEmitter();
vi.mock("electron", () => ({ powerMonitor, default: { powerMonitor } }));

const { UsagePoller } = await import("../electron/services/usagePoller.js");

describe("UsagePoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    powerMonitor.removeAllListeners();
  });

  it("notifies only on at-limit to available transitions", async () => {
    const profile = {
      id: "p1",
      name: "Work",
      createdAt: "",
      updatedAt: "",
      isActive: false
    };
    const profileStore = {
      refreshAllUsage: vi.fn(async () => [
        { profile, before: "at_limit", after: "available", usage: { status: "available" }, becameAvailable: true }
      ]),
      autoSwitchIfNeeded: vi.fn(async () => undefined),
      getState: vi.fn(async () => ({ settings: { pollingIntervalMinutes: 20 } }))
    };
    const notifications = { notifyAvailable: vi.fn() };
    const onStateChanged = vi.fn(async () => {});
    const poller = new UsagePoller(profileStore as never, notifications as never, onStateChanged, 20 * 60 * 1000);

    await poller.poll();

    expect(notifications.notifyAvailable).toHaveBeenCalledWith(profile);
  });

  it("does not notify unavailable profiles", async () => {
    const profileStore = {
      refreshAllUsage: vi.fn(async () => [
        { profile: { id: "p1" }, before: "at_limit", after: "unavailable", usage: { status: "unavailable" }, becameAvailable: false }
      ]),
      autoSwitchIfNeeded: vi.fn(async () => undefined),
      getState: vi.fn(async () => ({ settings: { pollingIntervalMinutes: 20 } }))
    };
    const notifications = { notifyAvailable: vi.fn() };
    const onStateChanged = vi.fn(async () => {});
    const poller = new UsagePoller(profileStore as never, notifications as never, onStateChanged);

    await poller.poll();

    expect(notifications.notifyAvailable).not.toHaveBeenCalled();
  });

  it("pauses polling while suspended and resumes without waking the machine", async () => {
    const profileStore = {
      refreshAllUsage: vi.fn(async () => []),
      autoSwitchIfNeeded: vi.fn(async () => undefined),
      getState: vi.fn(async () => ({ settings: { pollingIntervalMinutes: 1 / 60 } }))
    };
    const notifications = { notifyAvailable: vi.fn() };
    const onStateChanged = vi.fn(async () => {});
    const poller = new UsagePoller(profileStore as never, notifications as never, onStateChanged, 1000);

    poller.start();
    powerMonitor.emit("suspend");
    await vi.advanceTimersByTimeAsync(1000);
    expect(profileStore.refreshAllUsage).toHaveBeenCalledTimes(1);

    powerMonitor.emit("resume");
    await vi.advanceTimersByTimeAsync(1000);
    expect(profileStore.refreshAllUsage).toHaveBeenCalledTimes(2);

    poller.stop();
  });
});
