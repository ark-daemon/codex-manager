import electron from "electron";
import { ProfileStore } from "./profileStore.js";
import { NotificationService } from "./notifications.js";

const { powerMonitor } = electron;

export interface PowerMonitorLike {
  on(event: "suspend" | "resume", listener: () => void): void;
  off(event: "suspend" | "resume", listener: () => void): void;
}

export class UsagePoller {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private suspended = false;
  private readonly monitor: PowerMonitorLike;

  constructor(
    private readonly profileStore: ProfileStore,
    private readonly notifications: NotificationService,
    private readonly onStateChanged: () => Promise<void>,
    private intervalMs = 20 * 60 * 1000,
    monitor?: PowerMonitorLike
  ) {
    this.monitor = monitor ?? powerMonitor;
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.monitor.on("suspend", this.handleSuspend);
    this.monitor.on("resume", this.handleResume);
    this.schedule();
    void this.poll();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.monitor.off("suspend", this.handleSuspend);
    this.monitor.off("resume", this.handleResume);
  }

  async poll(): Promise<void> {
    if (this.running || this.suspended) {
      return;
    }

    this.running = true;
    try {
      const transitions = await this.profileStore.refreshAllUsage();
      const settings = (await this.profileStore.getState()).settings;
      for (const transition of transitions) {
        if (settings.notifyWhenAvailable !== false && transition.becameAvailable) {
          this.notifications.notifyAvailable(transition.profile);
        }
        if (transition.lowQuotaCrossed && transition.lowQuotaPercent !== undefined) {
          this.notifications.notifyLowQuota(
            transition.profile,
            transition.lowQuotaPercent,
            settings.lowQuotaThresholdPercent,
            settings.autoSwitchEnabled
          );
        }
      }
      await this.profileStore.autoSwitchIfNeeded();
      await this.onStateChanged();
      const currentSettings = (await this.profileStore.getState()).settings;
      const nextIntervalMs = currentSettings.pollingIntervalMinutes * 60 * 1000;
      if (nextIntervalMs !== this.intervalMs) {
        this.intervalMs = nextIntervalMs;
        this.reschedule();
      }
    } finally {
      this.running = false;
    }
  }

  private schedule(): void {
    this.timer = setInterval(() => {
      void this.poll();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  private reschedule(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = undefined;
    this.schedule();
  }

  private readonly handleSuspend = (): void => {
    this.suspended = true;
  };

  private readonly handleResume = (): void => {
    this.suspended = false;
  };
}
