import type { QuotaPool, UsageSnapshot } from "./types.js";

export function parseJwtPayload(token: string): Record<string, unknown> | undefined {
  const [, payload] = token.split(".");
  if (!payload) {
    return undefined;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${normalized}${"=".repeat((4 - normalized.length % 4) % 4)}`;
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function findEmail(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["email", "account_email", "accountEmail"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && isEmail(candidate)) {
      return candidate;
    }
  }
  for (const nested of Object.values(record)) {
    const email = findEmail(nested);
    if (email) {
      return email;
    }
  }
  return undefined;
}

export function emailFromJwt(token: string): string | undefined {
  const payload = parseJwtPayload(token);
  return payload ? findEmail(payload) : undefined;
}

export function quotaPercent(usage: UsageSnapshot | undefined): number | undefined {
  const pool = primaryPool(usage);
  if (!pool || pool.remaining === undefined || pool.limit === undefined || pool.limit <= 0) {
    return undefined;
  }
  return Math.max(0, Math.min(100, (pool.remaining / pool.limit) * 100));
}

export function primaryPool(usage: UsageSnapshot | undefined): { remaining?: number; limit?: number } | undefined {
  if (!usage || usage.status !== "available") {
    return undefined;
  }
  const fivePool = usage.pools?.find((item: QuotaPool) => item.id.includes("five"));
  const weeklyPool = usage.pools?.find((item: QuotaPool) => item.id.includes("weekly"));
  const monthlyPool = usage.pools?.find((item: QuotaPool) => item.id.includes("monthly"));
  const creditsPool = usage.pools?.find((item: QuotaPool) => item.id.includes("credits"));
  if (fivePool) {
    return { remaining: fivePool.remaining, limit: fivePool.limit };
  }
  if (weeklyPool) {
    return { remaining: weeklyPool.remaining, limit: weeklyPool.limit };
  }
  if (monthlyPool) {
    return { remaining: monthlyPool.remaining, limit: monthlyPool.limit };
  }
  if (creditsPool) {
    return { remaining: creditsPool.remaining, limit: creditsPool.limit };
  }
  if (usage.fiveHour) {
    return { remaining: usage.fiveHour.remaining, limit: usage.fiveHour.limit };
  }
  if (usage.weekly) {
    return { remaining: usage.weekly.remaining, limit: usage.weekly.limit };
  }
  if (usage.monthly) {
    return { remaining: usage.monthly.remaining, limit: usage.monthly.limit };
  }
  if (usage.credits) {
    return { remaining: usage.credits.remaining, limit: usage.credits.limit };
  }
  return undefined;
}
