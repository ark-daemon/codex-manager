import path from "node:path";
import type { AvailabilityStatus, QuotaPool, UsageSnapshot, UsageWindow } from "../../src/shared/types.js";
import { readAuthFileWithDiagnostics, writeAuthFile, type ReadAuthFileOptions } from "./authStorage.js";
import { emailFromJwt, findEmail, parseJwtPayload } from "../../src/shared/utils.js";
import type { CodexAuthJson } from "./codexProfileMirror.js";

// Matches the OAuth endpoint used at login — same client_id, same token URL.
const OAUTH_TOKEN_ENDPOINT = "https://auth.openai.com/oauth/token";
const OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

/**
 * Mask an email for logging so account identities never hit the log file in
 * cleartext. Keeps just enough to correlate entries during debugging:
 *   "alice@gmail.com" -> "a***@gmail.com"
 * Returns "unknown" when no email is available.
 */
function maskEmail(email?: string): string {
  if (!email) {
    return "unknown";
  }
  const at = email.indexOf("@");
  if (at <= 0) {
    return "***";
  }
  const first = email[0];
  const domain = email.slice(at + 1);
  return `${first}***@${domain}`;
}

export interface UsageServiceOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}

interface TokenCandidate {
  label: string;
  value: string;
}

interface AuthInfo {
  tokens: TokenCandidate[];
  accountId?: string;
  email?: string;
  /** Raw refresh_token from auth.json (tokens.refresh_token). Used to silently re-auth on 401/403. */
  refreshToken?: string;
  /** Path the auth.json was read from — used to persist a refreshed token back to disk. */
  authPath?: string;
  /** Raw parsed auth.json object — needed to reconstruct the file after a token refresh. */
  rawAuth?: CodexAuthJson;
}

interface RawUsageWindow {
  limit?: number | string;
  total?: number | string;
  quota?: number | string;
  used?: number | string;
  consumed?: number | string;
  remaining?: number | string;
  available?: number | string;
  used_percent?: number | string;
  usedPercent?: number | string;
  remaining_percent?: number | string;
  remainingPercent?: number | string;
  reset_at?: number | string;
  resets_at?: number | string;
  resetAt?: number | string;
  reset_seconds?: number | string;
  resetAfterSeconds?: number | string;
  reset_after_seconds?: number | string;
  limit_window_seconds?: number | string;
  window_seconds?: number | string;
  windowSeconds?: number | string;
  window_minutes?: number | string;
  windowMinutes?: number | string;
}

interface RawUsageSection {
  five_hour?: RawUsageWindow;
  fiveHour?: RawUsageWindow;
  "5h"?: RawUsageWindow;
  five_hour_limit?: RawUsageWindow;
  fiveHourLimit?: RawUsageWindow;
  weekly?: RawUsageWindow;
  week?: RawUsageWindow;
  weekly_limit?: RawUsageWindow;
  weeklyLimit?: RawUsageWindow;
  credits?: RawUsageWindow;
  credit?: RawUsageWindow;
  credit_balance?: RawUsageWindow;
  creditBalance?: RawUsageWindow;
  individual_limit?: RawUsageWindow;
  individualLimit?: RawUsageWindow;
  primary_window?: RawUsageWindow;
  primaryWindow?: RawUsageWindow;
  secondary_window?: RawUsageWindow;
  secondaryWindow?: RawUsageWindow;
  codex?: RawUsageSection;
  codex_usage?: RawUsageSection;
  usage?: RawUsageSection;
  limits?: RawUsageSection;
  rate_limit?: RawUsageSection;
  rate_limits?: RawUsageSection;
  spend_control?: RawUsageSection;
  account_id?: string;
  accountId?: string;
}

export class UsageService {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor(options: UsageServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async refreshForProfile(profilePath: string): Promise<UsageSnapshot> {
    const authPath = path.join(profilePath, "codex-agent", "auth.json");
    return this.refreshForAuthPath(authPath);
  }

  async refreshForAuthPath(authPath: string, options?: ReadAuthFileOptions): Promise<UsageSnapshot> {
    const authInfo = await this.readAuthInfo(authPath, options);
    const candidates = authInfo.tokens;
    if (candidates.length === 0) {
      return this.unavailable("No usable ChatGPT bearer token was found in this profile.", authInfo.email);
    }
    if (!authInfo.accountId) {
      return this.unavailable("No ChatGPT account ID was found in this profile.", authInfo.email);
    }

    let firstUnavailable: UsageSnapshot | undefined;
    let firstError: UsageSnapshot | undefined;
    for (const candidate of candidates) {
      const snapshot = await this.tryFetchUsageWithRefresh(candidate, authInfo);
      if (snapshot.status === "available") {
        return snapshot;
      }
      if (!firstUnavailable && snapshot.status === "unavailable") {
        firstUnavailable = snapshot;
      }
      if (!firstError && snapshot.status === "error") {
        firstError = snapshot;
      }
      if (snapshot.status === "unavailable" && snapshot.message === "Token expired") {
        return snapshot;
      }
    }

    return firstUnavailable ?? firstError ?? this.unavailable("Usage unavailable from the ChatGPT quota endpoint for this account.", authInfo.email);
  }

  deriveAvailability(snapshot: UsageSnapshot): AvailabilityStatus {
    if (snapshot.status !== "available") {
      return snapshot.status === "unavailable" ? "unavailable" : "unknown";
    }

    if (snapshot.pools?.length) {
      if (snapshot.pools.some((pool) => pool.status === "exhausted" || (Number.isFinite(pool.remaining) && (pool.remaining ?? 0) <= 0))) {
        return "at_limit";
      }
      return snapshot.pools.some((pool) => pool.status === "available") ? "available" : "unavailable";
    }

    const windows: UsageWindow[] = [];
    if (snapshot.fiveHour) {
      windows.push(snapshot.fiveHour);
    }
    if (snapshot.weekly) {
      windows.push(snapshot.weekly);
    }
    if (windows.length === 0) {
      return "unknown";
    }
    return windows.some((window) => Number.isFinite(window.remaining) && (window.remaining ?? 0) <= 0)
      ? "at_limit"
      : "available";
  }

  private async readAuthInfo(authPath: string, options?: ReadAuthFileOptions): Promise<AuthInfo> {
    // --- Diagnostic read: logs path, file-exists, decryption outcome, and any error ---
    const diag = await readAuthFileWithDiagnostics(authPath, options);
    console.info(
      `[UsageService] auth.json diagnostics` +
      ` | path=${diag.path}` +
      ` | exists=${diag.exists}` +
      ` | decryptionOutcome=${diag.decryptionOutcome}` +
      (diag.decryptionError ? ` | decryptionError=${diag.decryptionError}` : "")
    );

    if (!diag.text) {
      console.warn(`[UsageService] auth.json not readable at ${authPath} (outcome=${diag.decryptionOutcome})`);
      return { tokens: [], authPath };
    }

    try {
      // SAFETY: JSON parsed from validated auth.json file matches CodexAuthJson shape
      const parsed = JSON.parse(diag.text) as CodexAuthJson;
      const candidates: TokenCandidate[] = [];
      let email = findEmail(parsed.account)
        ?? (parsed.tokens?.id_token ? emailFromJwt(parsed.tokens.id_token) : undefined)
        ?? (parsed.tokens?.access_token ? emailFromJwt(parsed.tokens.access_token) : undefined)
        ?? findEmailInText(diag.text);
      const tokens = parsed.tokens;
      let refreshToken: string | undefined;

      if (tokens) {
        if (tokens.access_token) {
          candidates.push({ label: "access_token", value: tokens.access_token });
          email ??= emailFromJwt(tokens.access_token);
        }
        if (tokens.id_token) {
          candidates.push({ label: "id_token", value: tokens.id_token });
          email ??= emailFromJwt(tokens.id_token);
        }
        refreshToken = tokens.refresh_token;
      }

      const accountId = tokens?.account_id
        ?? parsed.account?.account_id
        ?? parsed.account?.id
        ?? findAccountIdFromCandidates(candidates);

      return {
        tokens: dedupeCandidates(candidates),
        accountId,
        email,
        refreshToken,
        authPath,
        rawAuth: parsed
      };
    } catch {
      console.warn(`[UsageService] auth.json at ${authPath} is not valid JSON despite being readable`);
      return { tokens: [], authPath };
    }
  }

  /**
   * Attempt to fetch quota for a single token candidate.
   * On 401 or 403, silently refresh the access_token via refresh_token and retry once.
   */
  private async tryFetchUsageWithRefresh(
    candidate: TokenCandidate,
    authInfo: AuthInfo
  ): Promise<UsageSnapshot> {
    const accountId = authInfo.accountId!;
    const accountEmail = authInfo.email;
    const initial = await this.tryFetchUsage(candidate, accountId, accountEmail);

    // Only attempt a token refresh when we got a recoverable auth error AND we have
    // a refresh_token available.
    const isAuthError = initial.status === "unavailable" &&
      (initial.message === "Token expired" ||
        initial.message?.startsWith("ChatGPT quota request failed with HTTP 401") ||
        initial.message?.startsWith("ChatGPT quota request failed with HTTP 403"));

    if (!isAuthError || !authInfo.refreshToken || !authInfo.authPath || !authInfo.rawAuth) {
      return initial;
    }

    console.info(`[UsageService] ${maskEmail(accountEmail)}: access_token rejected (${initial.message}), attempting token refresh…`);
    const refreshed = await this.tryRefreshToken(authInfo.refreshToken);
    if (!refreshed) {
      console.warn(`[UsageService] ${maskEmail(accountEmail)}: token refresh failed — returning original error`);
      return initial;
    }

    console.info(`[UsageService] ${maskEmail(accountEmail)}: token refresh succeeded, retrying quota fetch`);

    // Persist the new tokens back to the profile's auth.json so subsequent
    // refreshes also use the new access_token.
    const updatedAuth: CodexAuthJson = {
      ...authInfo.rawAuth,
      tokens: {
        ...authInfo.rawAuth.tokens,
        access_token: refreshed.accessToken,
        id_token: refreshed.idToken ?? authInfo.rawAuth.tokens?.id_token,
        refresh_token: refreshed.refreshToken ?? authInfo.refreshToken
      },
      last_refresh: this.now().toISOString()
    };

    try {
      await writeAuthFile(authInfo.authPath, JSON.stringify(updatedAuth, null, 2) + "\n");
    } catch (err) {
      console.warn(`[UsageService] could not persist refreshed token to ${authInfo.authPath}:`, err);
    }

    const retryCandidate: TokenCandidate = { label: "access_token (refreshed)", value: refreshed.accessToken };
    return this.tryFetchUsage(retryCandidate, accountId, accountEmail);
  }

  /**
   * Exchange a refresh_token for a new access_token using the same OAuth endpoint as login.
   * Returns the new tokens on success, undefined on any failure.
   */
  async tryRefreshToken(
    refreshToken: string
  ): Promise<{ accessToken: string; idToken?: string; refreshToken?: string } | undefined> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: OAUTH_CLIENT_ID,
      refresh_token: refreshToken
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(OAUTH_TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: controller.signal
      });

      if (!response.ok) {
        // SECURITY: do NOT log the response body — OAuth error payloads can contain
        // token or claim fragments. The HTTP status is enough to diagnose.
        console.warn(`[UsageService] token refresh HTTP ${response.status}`);
        return undefined;
      }

      interface OAuthRefreshPayload {
        access_token?: string;
        id_token?: string;
        refresh_token?: string;
      }

      // SAFETY: parsed JSON from OAuth refresh endpoint matches OAuthRefreshPayload structure
      const payload = (await response.json()) as OAuthRefreshPayload;
      const accessToken = payload.access_token?.trim();
      if (!accessToken) {
        console.warn("[UsageService] token refresh response missing access_token");
        return undefined;
      }

      return {
        accessToken,
        idToken: payload.id_token?.trim(),
        refreshToken: payload.refresh_token?.trim()
      };
    } catch (err) {
      const message = err instanceof Error && err.name === "AbortError"
        ? "timed out"
        : String(err);
      console.warn(`[UsageService] token refresh failed: ${message}`);
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async tryFetchUsage(candidate: TokenCandidate, accountId: string, accountEmail?: string): Promise<UsageSnapshot> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl("https://chatgpt.com/backend-api/wham/usage", {
        headers: {
          Authorization: `Bearer ${candidate.value}`,
          "ChatGPT-Account-Id": accountId
        },
        signal: controller.signal
      });

      if (!response.ok) {
        const errMsg = `ChatGPT quota request failed with HTTP ${response.status}.`;
        console.warn(`[UsageService] ${maskEmail(accountEmail)}: ${errMsg} (token label: ${candidate.label})`);
        if (response.status === 403) {
          return this.unavailable("Token expired", accountEmail);
        }
        if ([401, 404].includes(response.status)) {
          return this.unavailable(errMsg, accountEmail);
        }
        return this.error(errMsg, accountEmail);
      }

      // SAFETY: parsed HTTP JSON payload is cast to RawUsageSection for quota extraction
      const body = (await response.json()) as RawUsageSection;
      const parsed = parseCodexUsage(body, this.now());
      if (parsed) {
        return {
          status: "available",
          ...parsed,
          pools: codexPools(parsed.fiveHour, parsed.weekly, parsed.monthly, parsed.credits),
          accountEmail,
          checkedAt: this.now().toISOString(),
          source: "chatgpt-wham"
        };
      }

      const noDataMsg = "Codex 5-hour and weekly limits were not found in the usage response.";
      console.warn(`[UsageService] ${maskEmail(accountEmail)}: ${noDataMsg}`);
      return this.unavailable(noDataMsg, accountEmail);
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError"
        ? "ChatGPT quota request timed out."
        : "ChatGPT quota request failed.";
      console.warn(`[UsageService] ${maskEmail(accountEmail)}: ${message}`, error);
      return this.error(message, accountEmail);
    } finally {
      clearTimeout(timeout);
    }
  }

  private unavailable(message: string, accountEmail?: string): UsageSnapshot {
    return {
      status: "unavailable",
      accountEmail,
      checkedAt: this.now().toISOString(),
      source: "chatgpt-wham",
      message
    };
  }

  private error(message: string, accountEmail?: string): UsageSnapshot {
    return {
      status: "error",
      accountEmail,
      checkedAt: this.now().toISOString(),
      source: "chatgpt-wham",
      message
    };
  }
}

function codexPools(fiveHour?: UsageWindow, weekly?: UsageWindow, monthly?: UsageWindow, credits?: UsageWindow): QuotaPool[] {
  const pools: QuotaPool[] = [];
  if (fiveHour) {
    pools.push(usageWindowToPool("codex-five-hour", "5-hour", fiveHour));
  }
  if (weekly) {
    pools.push(usageWindowToPool("codex-weekly", "Weekly", weekly));
  }
  if (monthly) {
    pools.push(usageWindowToPool("codex-monthly", "Monthly", monthly));
  }
  if (credits) {
    pools.push(usageWindowToPool("codex-credits", "Credits", credits));
  }
  return pools;
}

function usageWindowToPool(id: string, label: string, window?: UsageWindow): QuotaPool {
  if (!window) {
    return { id, label, status: "unavailable", message: "Unavailable" };
  }
  const remaining = window.remaining ?? (window.limit !== undefined && window.used !== undefined ? Math.max(0, window.limit - window.used) : undefined);
  return {
    id,
    label,
    status: remaining !== undefined && remaining <= 0 ? "exhausted" : "available",
    used: window.used,
    limit: window.limit,
    remaining,
    resetAt: window.resetAt
  };
}

function findEmailInText(value: string): string | undefined {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function dedupeCandidates(candidates: TokenCandidate[]): TokenCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.value)) {
      return false;
    }
    seen.add(candidate.value);
    return true;
  });
}

function parseCodexUsage(body: RawUsageSection, now: Date): Pick<UsageSnapshot, "fiveHour" | "weekly" | "monthly" | "credits"> | undefined {
  if (!body) {
    return undefined;
  }
  const candidates: RawUsageSection[] = [
    body,
    body.codex,
    body.codex_usage,
    body.usage,
    body.limits,
    body.rate_limit,
    body.rate_limits,
    body.spend_control
  ].filter((item): item is RawUsageSection => Boolean(item));

  for (const candidate of candidates) {
    let fiveHour = parseWindow(
      candidate.five_hour
      ?? candidate.fiveHour
      ?? candidate["5h"]
      ?? candidate.five_hour_limit
      ?? candidate.fiveHourLimit,
      now
    );
    let weekly = parseWindow(
      candidate.weekly
      ?? candidate.week
      ?? candidate.weekly_limit
      ?? candidate.weeklyLimit,
      now
    );
    const credits = parseWindow(
      candidate.credits
      ?? candidate.credit
      ?? candidate.credit_balance
      ?? candidate.creditBalance,
      now
    );
    let monthly = parseWindow(
      candidate.individual_limit
      ?? candidate.individualLimit,
      now
    );
    const primary = parseWindowCandidate(candidate.primary_window ?? candidate.primaryWindow, now);
    const secondary = parseWindowCandidate(candidate.secondary_window ?? candidate.secondaryWindow, now);
    const inferred = inferPrimarySecondaryWindows(primary, secondary);
    fiveHour ??= inferred.fiveHour;
    if (!fiveHour && weekly && primary && !secondary && primary.windowSeconds === undefined) {
      fiveHour = primary.window;
    }
    weekly ??= inferred.weekly;
    monthly ??= inferred.monthly;
    if (fiveHour || weekly || monthly || credits) {
      return { fiveHour, weekly, monthly, credits };
    }
  }
  return undefined;
}

function inferPrimarySecondaryWindows(
  primary: ParsedWindowCandidate | undefined,
  secondary: ParsedWindowCandidate | undefined
): Pick<UsageSnapshot, "fiveHour" | "weekly" | "monthly"> {
  let fiveHour: UsageWindow | undefined;
  let weekly: UsageWindow | undefined;
  let monthly: UsageWindow | undefined;
  const unresolved: ParsedWindowCandidate[] = [];

  for (const candidate of [primary, secondary]) {
    if (!candidate) {
      continue;
    }
    if (candidate.windowSeconds !== undefined) {
      if (candidate.windowSeconds >= 25 * 24 * 3600) {
        monthly = monthly ?? candidate.window;
        continue;
      }
      if (candidate.windowSeconds >= 3 * 24 * 3600) {
        weekly = weekly ?? candidate.window;
        continue;
      }
      if (candidate.windowSeconds <= 12 * 3600) {
        fiveHour = fiveHour ?? candidate.window;
        continue;
      }
    }
    unresolved.push(candidate);
  }

  if (unresolved.length === 1 && !fiveHour && !weekly && !monthly) {
    weekly = unresolved[0].window;
  } else {
    for (const candidate of unresolved) {
      if (!fiveHour) {
        fiveHour = candidate.window;
      } else if (!weekly) {
        weekly = candidate.window;
      } else if (!monthly) {
        monthly = candidate.window;
      }
    }
  }

  if (!weekly && !monthly && primary && !secondary && primary.windowSeconds !== undefined) {
    if (primary.windowSeconds >= 25 * 24 * 3600) {
      monthly = primary.window;
    } else if (primary.windowSeconds >= 3 * 24 * 3600) {
      weekly = primary.window;
    }
    if (fiveHour === primary.window) {
      fiveHour = undefined;
    }
  }

  return { fiveHour, weekly, monthly };
}

interface ParsedWindowCandidate {
  window: UsageWindow;
  windowSeconds?: number;
}

function parseWindow(value: RawUsageWindow | undefined, now: Date): UsageWindow | undefined {
  return parseWindowCandidate(value, now)?.window;
}

function parseWindowCandidate(value: RawUsageWindow | undefined, now: Date): ParsedWindowCandidate | undefined {
  if (!value) {
    return undefined;
  }
  const limit = numberFrom(value.limit ?? value.total ?? value.quota);
  const used = numberFrom(value.used ?? value.consumed);
  const remaining = numberFrom(value.remaining ?? value.available);
  const usedPercent = numberFrom(value.used_percent ?? value.usedPercent);
  const remainingPercent = numberFrom(value.remaining_percent ?? value.remainingPercent);
  const resetAtValue = value.resetAt ?? value.reset_at ?? value.resets_at;
  const windowSeconds = numberFrom(value.limit_window_seconds ?? value.window_seconds ?? value.windowSeconds)
    ?? (() => {
      const windowMinutes = numberFrom(value.window_minutes ?? value.windowMinutes);
      return windowMinutes !== undefined ? windowMinutes * 60 : undefined;
    })();
  const percentBasedLimit = usedPercent !== undefined || remainingPercent !== undefined ? 100 : undefined;
  const percentBasedUsed = usedPercent;
  const percentBasedRemaining = remainingPercent ?? (usedPercent !== undefined ? Math.max(0, 100 - usedPercent) : undefined);

  if (
    limit === undefined
    && used === undefined
    && remaining === undefined
    && percentBasedUsed === undefined
    && percentBasedRemaining === undefined
  ) {
    return undefined;
  }

  const normalizedLimit = limit ?? percentBasedLimit;
  const normalizedUsed = used ?? percentBasedUsed;
  const normalizedRemaining = remaining
    ?? percentBasedRemaining
    ?? (normalizedLimit !== undefined && normalizedUsed !== undefined ? Math.max(0, normalizedLimit - normalizedUsed) : undefined);

  return {
    window: {
      limit: normalizedLimit,
      used: normalizedUsed,
      remaining: normalizedRemaining,
      resetAt: normalizeResetAt(resetAtValue, now) ?? inferResetAt(
        value.reset_seconds ?? value.resetAfterSeconds ?? value.reset_after_seconds,
        now
      )
    },
    windowSeconds
  };
}

function numberFrom(value?: number | string | null): number | undefined {
  if (Number.isFinite(value)) {
    // SAFETY: Number.isFinite confirms value is a valid finite numeric value
    return value as number;
  }
  if (value && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function inferResetAt(value: number | string | undefined | null, now: Date): string | undefined {
  const seconds = numberFrom(value);
  if (seconds === undefined) {
    return undefined;
  }
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

function normalizeResetAt(value: number | string | undefined | null, now: Date): string | undefined {
  if (value && Number.isNaN(Number(value)) && String(value).trim()) {
    return String(value).trim();
  }
  const numeric = numberFrom(value);
  if (numeric === undefined) {
    return undefined;
  }
  if (numeric > 1_000_000_000) {
    const asMs = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    return new Date(asMs).toISOString();
  }
  if (numeric >= 0 && numeric <= 604_800) {
    return new Date(now.getTime() + numeric * 1000).toISOString();
  }
  return undefined;
}

function findAccountIdFromCandidates(candidates: TokenCandidate[]): string | undefined {
  for (const candidate of candidates) {
    const value = findAccountId(candidate.value);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function findAccountId(token: string): string | undefined {
  const payload = parseJwtPayload(token);
  if (!payload) {
    return undefined;
  }
  const candidate = payload.account_id ?? payload.accountId ?? payload.chatgpt_account_id ?? payload.chatgptAccountId;
  if (candidate && candidate.trim()) {
    return candidate.trim();
  }
  return undefined;
}
