import electron from "electron";
import type { BrowserWindow } from "electron";
import { ProfileActionInput, ProfileSummary } from "../../src/shared/types.js";

const { Notification } = electron;

export type SwitchHandler = (input: ProfileActionInput) => void | Promise<void>;

export function accountNotificationLabel(profile: Pick<ProfileSummary, "name" | "email">): string {
  const name = profile.name?.trim();
  const email = profile.email?.trim();
  if (name && email && name.toLowerCase() !== email.toLowerCase()) {
    return `${name} (${email})`;
  }
  return name || email || "Codex profile";
}

export class NotificationService {
  constructor(
    private readonly getMainWindow: () => BrowserWindow | undefined,
    private readonly switchHandler: SwitchHandler,
    private readonly iconPath?: string
  ) {}

  notifyAvailable(profile: ProfileSummary): void {
    if (!Notification.isSupported()) {
      this.focusProfile(profile);
      return;
    }

    const accountLabel = accountNotificationLabel(profile);
    const actions: Electron.NotificationAction[] = [
      { type: "button", text: "Switch Account" },
      { type: "button", text: "Open Manager" }
    ];
    const notification = new Notification({
      title: "Account Available Again",
      body: `${accountLabel} is available again. Switch when you're ready.`,
      icon: this.iconPath,
      actions,
      timeoutType: "default"
    });

    notification.on("action", (_event, index) => {
      if (index === 0) {
        void this.switchHandler({ profileId: profile.id });
        return;
      }
      this.focusProfile(profile);
    });

    notification.on("click", () => {
      this.focusProfile(profile);
    });

    notification.show();
  }

  notifyLowQuota(profile: ProfileSummary, percent: number, thresholdPercent: number, autoSwitchEnabled: boolean): void {
    if (!Notification.isSupported()) {
      this.focusProfile(profile);
      return;
    }

    const roundedPercent = Math.max(0, Math.round(percent));
    const accountLabel = accountNotificationLabel(profile);
    const depleted = roundedPercent <= 0;
    const title = depleted ? "Account Quota Depleted" : "Low Quota Alert";
    const body = depleted
      ? `The account ${accountLabel} has reached 0% quota.`
      : `${accountLabel} has dropped below your ${thresholdPercent}% alert threshold.`;
    const actions: Electron.NotificationAction[] = autoSwitchEnabled
      ? [{ type: "button", text: "Open Manager" }]
      : [
        { type: "button", text: "Switch Account" },
        { type: "button", text: "Open Manager" }
      ];

    const notification = new Notification({
      title,
      body,
      icon: this.iconPath,
      actions,
      timeoutType: "default"
    });

    notification.on("action", (_event, index) => {
      if (!autoSwitchEnabled && index === 0) {
        void this.switchHandler({ profileId: profile.id });
        return;
      }
      this.focusProfile(profile);
    });

    notification.on("click", () => {
      this.focusProfile(profile);
    });

    notification.show();
  }

  private focusProfile(profile: ProfileSummary): void {
    const window = this.getMainWindow();
    if (!window) {
      return;
    }

    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
    window.webContents.send("profile:focus", { profileId: profile.id });
  }
}
