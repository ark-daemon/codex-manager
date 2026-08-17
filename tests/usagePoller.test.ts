import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PowerMonitorLike, UsagePoller } from "../electron/services/usagePoller.js";

describe("UsagePoller", () => {
  let powerMonitorEmitter: EventEmitter;
  let powerMonitor: PowerMonitorLike;

  beforeEach(() => {
    vi.useFakeTimers();
    powerMonitorEmitter = new EventEmitter();
    powerMonitor = {
      on: (event, listener) => {
        powerMonitorEmitter.on(event, listener);
      },
      off: (event, listener) => {
        powerMonitorEmitter.off(event, listener);
      }
    };
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
    // SAFETY: mock ProfileStore and NotificationService for test
    const poller = new UsagePoller(profileStore as never, notifications as never, onStateChanged, 20 * 60 * 1000, powerMonitor);

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
    // SAFETY: mock ProfileStore and NotificationService for test
    const poller = new UsagePoller(profileStore as never, notifications as never, onStateChanged, 20 * 60 * 1000, powerMonitor);

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
    // SAFETY: mock ProfileStore and NotificationService for test
    const poller = new UsagePoller(profileStore as never, notifications as never, onStateChanged, 1000, powerMonitor);

    poller.start();
    powerMonitorEmitter.emit("suspend");
    await vi.advanceTimersByTimeAsync(1000);
    expect(profileStore.refreshAllUsage).toHaveBeenCalledTimes(1);

    powerMonitorEmitter.emit("resume");
    await vi.advanceTimersByTimeAsync(1000);
    expect(profileStore.refreshAllUsage).toHaveBeenCalledTimes(2);

    poller.stop();
  });
});
