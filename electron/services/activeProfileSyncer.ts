import type { ProfileStore } from "./profileStore.js";
import { getAppDefinition } from "./paths.js";
import type { ProcessManager } from "./processManager.js";

export type SyncCallback = () => void | Promise<void>;

export class ActiveProfileSyncer {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly profileStore: ProfileStore,
    private readonly processManager: ProcessManager,
    private readonly onSynced: SyncCallback = () => undefined
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.schedule(0);
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  restart(): void {
    this.stop();
    this.start();
  }

  async syncOnce(): Promise<boolean> {
    if (this.running) {
      return false;
    }

    this.running = true;
    try {
      const state = await this.profileStore.getState();
      if (!state.settings.autoSyncCurrentAccount || !state.settings.activeProfileId) {
        return false;
      }

      if (!await this.processManager.isRunning(getAppDefinition())) {
        return false;
      }

      await this.profileStore.syncActiveProfileFromLive();
      await this.profileStore.autoSwitchIfNeeded();
      console.info(`[auto-sync] Active profile synced at ${new Date().toISOString()}`);
      await this.onSynced();
      return true;
    } finally {
      this.running = false;
    }
  }

  private schedule(delayMs: number): void {
    this.timer = setTimeout(async () => {
      this.timer = undefined;
      await this.syncOnce().catch((error: Error | string | null | undefined) => {
        console.error("Auto sync failed", error);
      });

      const state = await this.profileStore.getState().catch(() => undefined);
      const intervalMinutes = state?.settings.syncIntervalMinutes ?? 5;
      this.schedule(Math.max(1, Math.min(30, intervalMinutes)) * 60 * 1000);
    }, delayMs);
    this.timer.unref?.();
  }
}
