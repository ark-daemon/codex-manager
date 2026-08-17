import type { QuotaPool, UsageSnapshot } from "./types.js";

export interface JwtClaims {
  email?: string;
  account_email?: string;
  accountEmail?: string;
  exp?: number;
  picture?: string;
  avatar_url?: string;
  avatarUrl?: string;
  image?: string;
  photo_url?: string;
  photoUrl?: string;
  account_id?: string;
  accountId?: string;
  chatgpt_account_id?: string;
  chatgptAccountId?: string;
  "https://api.openai.com/auth"?: Record<string, string | number | boolean | null | undefined>;
}

export function parseJwtPayload(token: string): JwtClaims | undefined {
  const [, payload] = token.split(".");
  if (!payload) {
    return undefined;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${normalized}${"=".repeat((4 - normalized.length % 4) % 4)}`;
    // SAFETY: JSON object decoded from base64 JWT payload satisfies JwtClaims interface
    const parsed = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as JwtClaims;
    return parsed ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function findEmail(value?: JwtClaims | null): string | undefined {
  if (!value) {
    return undefined;
  }
  for (const candidate of [value.email, value.account_email, value.accountEmail]) {
    if (candidate && isEmail(candidate)) {
      return candidate;
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
