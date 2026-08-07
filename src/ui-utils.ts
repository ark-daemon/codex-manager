import { AppSettings, AppState, ProfileActionInput, ProfileSummary, QuotaPool, UsageSnapshot } from "./shared/types.js";
import { isEmail, primaryPool, quotaPercent } from "./shared/utils.js";

export function displayPrimaryLabel(profile: ProfileSummary): string {
 const name = profile.name.trim();
 if (!profile.email) {
 return name || "Codex profile";
 }
 if (!name || isEmailLike(name) || name.toLowerCase() === profile.email.toLowerCase()) {
 return profile.email;
 }
 return name;
}

function isEmailLike(value: string): boolean {
 return isEmail(value);
}

export function statusForProfile(profile: ProfileSummary): "active" | "ready" | "limited" | "expired" | "unknown" {
  if (profile.isActive) return "active";
  if (profile.usage?.message === "Token expired") return "expired";

  const pools = availablePools(profile.usage);
  if (pools.some((pool) => pool.status === "exhausted" || (typeof pool.remaining === "number" && pool.remaining <= 0))) {
    return "limited";
  }

  return "ready";
}

export function availablePools(usage: UsageSnapshot | undefined): QuotaPool[] {
 if (!usage) {
 return [];
 }
 if (usage.pools?.length) {
 return usage.pools;
 }

 const pools: QuotaPool[] = [];
 if (usage.fiveHour) {
 pools.push({
 id: "codex-five-hour",
 label: "5-hour",
 status: usage.fiveHour.remaining !== undefined && usage.fiveHour.remaining <= 0 ? "exhausted" : "available",
 used: usage.fiveHour.used,
 limit: usage.fiveHour.limit,
 remaining: usage.fiveHour.remaining,
 resetAt: usage.fiveHour.resetAt
 });
 }
 if (usage.weekly) {
 pools.push({
 id: "codex-weekly",
 label: "Weekly",
 status: usage.weekly.remaining !== undefined && usage.weekly.remaining <= 0 ? "exhausted" : "available",
 used: usage.weekly.used,
 limit: usage.weekly.limit,
 remaining: usage.weekly.remaining,
 resetAt: usage.weekly.resetAt
 });
 }
 if (usage.monthly) {
 pools.push({
 id: "codex-monthly",
 label: "Monthly",
 status: usage.monthly.remaining !== undefined && usage.monthly.remaining <= 0 ? "exhausted" : "available",
 used: usage.monthly.used,
 limit: usage.monthly.limit,
 remaining: usage.monthly.remaining,
 resetAt: usage.monthly.resetAt
 });
 }
 if (usage.credits) {
 pools.push({
 id: "codex-credits",
 label: "Credits",
 status: usage.credits.remaining !== undefined && usage.credits.remaining <= 0 ? "exhausted" : "available",
 used: usage.credits.used,
 limit: usage.credits.limit,
 remaining: usage.credits.remaining
 });
 }
 return pools;
}

export function buildStats(state: AppState | undefined) {
  if (!state) {
    return { total: 0, active: 0, ready: 0, rateLimited: 0, unavailable: 0, globalQuotaPercent: undefined as number | undefined, lowestRemainingPercent: undefined as number | undefined };
  }

  const statuses = state.profiles.map((profile) => statusForProfile(profile));
  const availablePercents = state.profiles
    .map((profile) => quotaPercent(profile.usage))
    .filter((value): value is number => typeof value === "number");
  const unavailable = state.profiles.filter((profile) => {
    if (profile.usage?.status === "unavailable") {
      return true;
    }
    return statusForProfile(profile) === "unknown";
  }).length;

  const lowestRemainingPercent = availablePercents.length
    ? Math.min(...availablePercents)
    : undefined;

  return {
    total: state.profiles.length,
    active: statuses.filter((status) => status === "active").length,
    ready: statuses.filter((status) => status === "ready").length,
    rateLimited: statuses.filter((status) => status === "limited").length,
    unavailable,
    globalQuotaPercent: availablePercents.length
      ? availablePercents.reduce((sum, value) => sum + value, 0) / availablePercents.length
      : undefined,
    lowestRemainingPercent
  };
}

export function getAvatarInitial(name: string, email?: string): string {
  const cleanName = name.trim();
  if (cleanName && cleanName.toLowerCase() !== email?.toLowerCase()) {
    const parts = cleanName.split(/\s+/);
    if (parts.length >= 2 && parts[0][0] && parts[1][0]) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return cleanName[0].toUpperCase();
  }
  if (email && email.trim()) {
    return email.trim()[0].toUpperCase();
  }
  return "A";
}

export function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "never";
  const timestamp = new Date(dateStr).getTime();
  if (Number.isNaN(timestamp)) return "never";
  const diffMs = Date.now() - timestamp;
  if (diffMs < 0 || diffMs < 30_000) return "Just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

/**
 * Colour for a quota progress bar.
 *
 * quota resets on a timer \u2014 so it must not be painted alarm-red. A grid of
 * cycling accounts should read as "waiting", not "broken". We use amber for
 * both rate-limited and low-but-live quota, and the brand orange for healthy
 * levels. Genuine failures (e.g. expired tokens) are surfaced via status
 * badges, not this bar.
 */
export function getBarColor(percentRemaining: number, isRateLimited: boolean): string {
 if (isRateLimited) return "#f59e0b"; // amber \u2014 cycling / waiting for reset, not an error
 if (percentRemaining <= 20) return "#f59e0b"; // amber \u2014 running low
 return "#e06020"; // brand orange \u2014 healthy
}

export function getApi() {
 return typeof window !== "undefined" ? window.profileSwitcher : undefined;
}

export function requireApi(setFatal: (message: string) => void) {
 const api = getApi();
 if (!api) {
 setFatal("Renderer bridge is not available. Preload may not have loaded.");
 }
 return api;
}

export function clampPercent(value: number): number {
 if (!Number.isFinite(value)) {
 return 1;
 }
 return Math.max(1, Math.min(95, Math.round(value)));
}

export function clampNumber(value: number, min: number, max: number): number {
 if (!Number.isFinite(value)) {
 return min;
 }
 return Math.max(min, Math.min(max, Math.round(value)));
}

export function resolveTheme(theme: AppSettings["theme"]): "light" | "dark" {
 if (theme === "dark" || theme === "light") {
 return theme;
 }
 return prefersDarkMode() ? "dark" : "light";
}

export function prefersDarkMode(): boolean {
 if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
 return false;
 }
 return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function firstProfile(state: AppState): ProfileActionInput | undefined {
 const profile = state.profiles[0];
 return profile ? { profileId: profile.id } : undefined;
}

export function firstProfileByCreatedAt(state: AppState): ProfileActionInput | undefined {
 const profile = [...state.profiles].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
 return profile ? { profileId: profile.id } : undefined;
}

export function errorMessage(error: unknown): string {
 if (!(error instanceof Error)) {
 return "Something went wrong.";
 }

 return error.message
 .replace(/^Error invoking remote method '[^']+':\s*/i, "")
 .replace(/^Error:\s*/i, "");
}

export function formatDate(value?: string): string {
 if (!value) return "never";
 return new Intl.DateTimeFormat(undefined, {
 month: "short",
 day: "numeric",
 hour: "numeric",
 minute: "2-digit"
 }).format(new Date(value));
}

/** Returns a human-readable countdown to the quota reset time.
 * Empty string = no resetAt available (caller should render nothing).
 * Rules:
 * > 24 h -> "Resets in Xd Yh"
 * 1-24 h -> "Resets in Xh Ym"
 * 5-60 m -> "Resets in Xm"
 * < 5 m -> "Resetting soon"
 * past -> "Refreshing..."
 */
export function formatResetCountdown(resetAt: string): string {
 const diffMs = new Date(resetAt).getTime() - Date.now();
 if (diffMs <= 0) return "Refreshing...";
 const totalMinutes = Math.floor(diffMs / 60_000);
 const totalHours = Math.floor(totalMinutes / 60);
 const totalDays = Math.floor(totalHours / 24);
 if (totalHours >= 24) return `Resets in ${totalDays}d ${totalHours % 24}h`;
 if (totalMinutes >= 60) return `Resets in ${totalHours}h ${totalMinutes % 60}m`;
 if (totalMinutes >= 5) return `Resets in ${totalMinutes}m`;
 return "Resetting soon";
}
