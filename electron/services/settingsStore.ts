import fs from "node:fs/promises";
import path from "node:path";
import { AppSettings } from "../../src/shared/types.js";

const defaultSettings: AppSettings = {
  autoSwitchEnabled: false,
  autoSwitchThresholdPercent: 10,
  pollingIntervalMinutes: 20,
  theme: "system",
  language: "en",
  autoRefreshQuota: true,
  autoSyncCurrentAccount: false,
  syncIntervalMinutes: 5,
  startWithSystem: false,
  lowQuotaAlerts: true,
  notifyWhenAvailable: true,
  lowQuotaThresholdPercent: 15,
  proxyEnabled: false,
  proxyUrl: "",
  serviceRunning: true,
  availabilityByProfile: {}
};

interface RawSettingsFile extends Partial<AppSettings> {
  activeProfileByApp?: { codex?: string };
  executablePaths?: { codex?: string };
}

export class SettingsStore {
  constructor(private readonly storageRoot: string) {}

  get settingsPath(): string {
    return path.join(this.storageRoot, "settings.json");
  }

  async read(): Promise<AppSettings> {
    try {
      const raw = await fs.readFile(this.settingsPath, "utf8");
      // SAFETY: JSON parsed from settings file is merged with default values to ensure complete AppSettings contract
      const parsed = JSON.parse(raw) as RawSettingsFile;
      return {
        activeProfileId: parsed.activeProfileId ?? parsed.activeProfileByApp?.codex,
        executablePath: parsed.executablePath ?? parsed.executablePaths?.codex,
        autoSwitchEnabled: parsed.autoSwitchEnabled ?? defaultSettings.autoSwitchEnabled,
        autoSwitchThresholdPercent: normalizeThreshold(parsed.autoSwitchThresholdPercent),
        pollingIntervalMinutes: normalizePollingInterval(parsed.pollingIntervalMinutes),
        theme: normalizeTheme(parsed.theme),
        language: normalizeLanguage(parsed.language),
        autoRefreshQuota: normalizeBoolean(parsed.autoRefreshQuota, defaultSettings.autoRefreshQuota),
        autoSyncCurrentAccount: normalizeBoolean(parsed.autoSyncCurrentAccount, defaultSettings.autoSyncCurrentAccount),
        syncIntervalMinutes: normalizeSyncInterval(parsed.syncIntervalMinutes),
        startWithSystem: normalizeBoolean(parsed.startWithSystem, defaultSettings.startWithSystem),
        lowQuotaAlerts: normalizeBoolean(parsed.lowQuotaAlerts, defaultSettings.lowQuotaAlerts),
        notifyWhenAvailable: normalizeBoolean(parsed.notifyWhenAvailable, defaultSettings.notifyWhenAvailable),
        lowQuotaThresholdPercent: normalizeLowQuotaThreshold(parsed.lowQuotaThresholdPercent),
        proxyEnabled: normalizeBoolean(parsed.proxyEnabled, defaultSettings.proxyEnabled),
        proxyUrl: normalizeProxyUrl(parsed.proxyUrl),
        serviceRunning: normalizeBoolean(parsed.serviceRunning, defaultSettings.serviceRunning),
        availabilityByProfile: parsed.availabilityByProfile ?? {}
      };
    } catch {
      return structuredClone(defaultSettings);
    }
  }

  async write(settings: AppSettings): Promise<void> {
    await fs.mkdir(this.storageRoot, { recursive: true });
    await fs.writeFile(this.settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  }

  async update(mutator: (settings: AppSettings) => void | Promise<void>): Promise<AppSettings> {
    const settings = await this.read();
    await mutator(settings);
    await this.write(settings);
    return settings;
  }
}

export function normalizeThreshold(value?: number | null): number {
  const number = Number.isFinite(value) ? (value ?? defaultSettings.autoSwitchThresholdPercent) : defaultSettings.autoSwitchThresholdPercent;
  return Math.max(1, Math.min(95, Math.round(number)));
}

export function normalizePollingInterval(value?: number | null): number {
  const number = Number.isFinite(value) ? (value ?? defaultSettings.pollingIntervalMinutes) : defaultSettings.pollingIntervalMinutes;
  return Math.max(15, Math.min(30, Math.round(number)));
}

export function normalizeSyncInterval(value?: number | null): number {
  const number = Number.isFinite(value) ? (value ?? defaultSettings.syncIntervalMinutes) : defaultSettings.syncIntervalMinutes;
  return Math.max(1, Math.min(30, Math.round(number)));
}

export function normalizeLowQuotaThreshold(value?: number | null): number {
  const number = Number.isFinite(value) ? (value ?? defaultSettings.lowQuotaThresholdPercent) : defaultSettings.lowQuotaThresholdPercent;
  return Math.max(1, Math.min(95, Math.round(number)));
}

function normalizeTheme(value?: string | null): AppSettings["theme"] {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }
  return defaultSettings.theme;
}

function normalizeLanguage(value?: string | null): string {
  return value && value.trim() ? value.trim().slice(0, 32) : defaultSettings.language;
}

function normalizeProxyUrl(value?: string | null): string {
  return value ? value.trim() : (defaultSettings.proxyUrl ?? "");
}

function normalizeBoolean(value: boolean | undefined | null, fallback: boolean): boolean {
  if (value === true) return true;
  if (value === false) return false;
  return fallback;
}
