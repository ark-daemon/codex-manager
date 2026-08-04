import crypto from "node:crypto";
import http from "node:http";
import { URL } from "node:url";
import { CodexAuthJson } from "./codexProfileMirror.js";
import { EnvPaths, getEnvPaths } from "./paths.js";
import { parseJwtPayload } from "../../src/shared/utils.js";

const OAUTH_AUTHORIZE_ENDPOINT = "https://auth.openai.com/oauth/authorize";
const OAUTH_TOKEN_ENDPOINT = "https://auth.openai.com/oauth/token";
const OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OAUTH_SCOPE = "openid profile email offline_access";
const OAUTH_REDIRECT_URI = "http://localhost:1455/auth/callback";
const CALLBACK_PATH = "/auth/callback";

export interface CodexLoginCapture {
  authJson: CodexAuthJson;
  accountEmail?: string;
  avatarUrl?: string;
}

export interface CodexLoginSession {
  captureId: string;
  authorizationUrl: string;
}

export interface CodexLoginCaptureServiceOptions {
  env?: EnvPaths;
  openExternal?: (url: string) => Promise<void>;
  now?: () => Date;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface ActiveSession {
  captureId: string;
  authorizationUrl: string;
  state: string;
  codeVerifier: string;
  timeout: NodeJS.Timeout;
  server: http.Server;
  settled: boolean;
  resolve: (value: CodexLoginCapture) => void;
  reject: (reason?: unknown) => void;
  promise: Promise<CodexLoginCapture>;
}

interface OAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  account_id?: string;
}

export class CodexLoginCaptureService {
  private readonly env: EnvPaths;
  private readonly openExternal: (url: string) => Promise<void>;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private activeSession: ActiveSession | undefined;

  constructor(options: CodexLoginCaptureServiceOptions = {}) {
    this.env = options.env ?? getEnvPaths();
    this.openExternal = options.openExternal ?? (async () => undefined);
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async capture(): Promise<CodexLoginCapture> {
    const session = await this.startCapture();
    await this.openLoginPage(session.captureId);
    return this.waitForCapture(session.captureId);
  }

  async startCapture(): Promise<CodexLoginSession> {
    if (this.activeSession && !this.activeSession.settled) {
      throw new Error("A login flow is already in progress.");
    }

    const captureId = crypto.randomUUID();
    const codeVerifier = base64UrlNoPadding(crypto.randomBytes(64));
    const codeChallenge = base64UrlNoPadding(crypto.createHash("sha256").update(codeVerifier).digest());
    const state = base64UrlNoPadding(crypto.randomBytes(24));
    const authorizationUrl = buildAuthorizationUrl(codeChallenge, state);

    const server = http.createServer();
    const session = await new Promise<ActiveSession>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const reason = new Error("Timed out waiting for OAuth callback.");
        this.finishSession(captureId, reason);
      }, this.timeoutMs);
      timeout.unref?.();

      const active: ActiveSession = {
        captureId,
        authorizationUrl,
        state,
        codeVerifier,
        timeout,
        server,
        settled: false,
        resolve: () => undefined,
        reject: () => undefined,
        promise: Promise.resolve({ authJson: {} })
      };

      active.promise = new Promise<CodexLoginCapture>((resolvePromise, rejectPromise) => {
        active.resolve = resolvePromise;
        active.reject = rejectPromise;
      });

      server.on("request", (request, response) => {
        void this.handleCallbackRequest(active, request, response);
      });

      server.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      server.listen(1455, "127.0.0.1", () => {
        resolve(active);
      });
    });

    this.activeSession = session;
    return {
      captureId: session.captureId,
      authorizationUrl: session.authorizationUrl
    };
  }

  async openLoginPage(captureId: string): Promise<void> {
    const session = this.requireSession(captureId);
    await this.openExternal(session.authorizationUrl);
  }

  async waitForCapture(captureId: string): Promise<CodexLoginCapture> {
    const session = this.requireSession(captureId);
    return session.promise;
  }

  async cancelCapture(captureId: string): Promise<void> {
    this.finishSession(captureId, new Error("Login cancelled."));
  }

  private async handleCallbackRequest(session: ActiveSession, request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const requestUrl = new URL(request.url ?? "/", OAUTH_REDIRECT_URI);
    if (requestUrl.pathname !== CALLBACK_PATH) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found.");
      return;
    }

    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    const error = requestUrl.searchParams.get("error");

    if (error) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`Login failed: ${error}`);
      this.finishSession(session.captureId, new Error(`OAuth callback failed: ${error}`));
      return;
    }

    if (!code) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Missing authorization code.");
      return;
    }

    if (!state || state !== session.state) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("State mismatch. Please close this tab and retry.");
      // Don't kill the session — this may be a stale redirect from a previous
      // login flow (e.g. the same Chrome profile re-firing the first account's
      // callback URL). Keep the session alive so the correct redirect can still
      // arrive and complete the login.
      return;
    }

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Login complete — Relay</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0a0a0a;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #e8e8e8;
      }
      .card {
        text-align: center;
        padding: 48px 56px;
        background: #141414;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        max-width: 380px;
        width: 90%;
      }
      .icon {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: #1a3a1a;
        border: 2px solid #2d6a2d;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 24px;
        font-size: 28px;
      }
      h1 {
        font-size: 28px;
        font-weight: 600;
        letter-spacing: -0.02em;
        margin-bottom: 10px;
        color: #f0f0f0;
      }
      p {
        font-size: 17px;
        color: #888;
        line-height: 1.6;
      }
      .closing-note {
        margin-top: 10px;
        font-size: 14px;
        color: #9ca3af;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon">✓</div>
      <h1>Account connected</h1>
      <p>You can close this tab and return to Relay.</p>
      <p class="closing-note" id="closing-note">Closing in 3 seconds...</p>
    </div>
    <script>
      const closingNote = document.getElementById("closing-note");
      closingNote.textContent = "You can now close this tab";
    </script>
  </body>
</html>`);

    try {
      const tokenResponse = await this.exchangeAuthorizationCode(code, session.codeVerifier);
      const capture = parseCaptureFromTokenResponse(tokenResponse, this.now());
      this.finishSession(session.captureId, capture);
    } catch (exchangeError) {
      this.finishSession(session.captureId, exchangeError);
    }
  }

  private async exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<OAuthTokenResponse> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT_URI,
      code,
      code_verifier: codeVerifier
    });

    const response = await this.fetchImpl(OAUTH_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Token exchange failed with HTTP ${response.status}${details ? `: ${details}` : ""}`);
    }

    const payload = (await response.json()) as OAuthTokenResponse;
    if (!payload.access_token || !payload.refresh_token || !payload.id_token) {
      throw new Error("Token exchange did not return access_token, refresh_token, and id_token.");
    }

    return payload;
  }

  private requireSession(captureId: string): ActiveSession {
    const session = this.activeSession;
    if (!session || session.captureId !== captureId || session.settled) {
      throw new Error("Login session was not found or has already completed.");
    }
    return session;
  }

  private finishSession(captureId: string, result: CodexLoginCapture | unknown): void {
    const session = this.activeSession;
    if (!session || session.captureId !== captureId || session.settled) {
      return;
    }

    session.settled = true;
    clearTimeout(session.timeout);
    session.server.close();

    if (result instanceof Error) {
      session.reject(result);
    } else {
      session.resolve(result as CodexLoginCapture);
    }

    this.activeSession = undefined;
  }
}

function buildAuthorizationUrl(codeChallenge: string, state: string): string {
  const url = new URL(OAUTH_AUTHORIZE_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", OAUTH_REDIRECT_URI);
  url.searchParams.set("scope", OAUTH_SCOPE);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("originator", "codex_manager");
  url.searchParams.set("state", state);
  // Force a fresh login prompt every time so the browser cannot reuse a cached
  // auth session from a previous "Add Account" flow. Without this, adding a
  // second account fails with "State mismatch" because the auth server returns
  // the old state from the still-open browser tab.
  url.searchParams.set("prompt", "login");
  return url.toString();
}

function base64UrlNoPadding(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parseCaptureFromTokenResponse(response: OAuthTokenResponse, now: Date): CodexLoginCapture {
  const idToken = response.id_token ?? "";
  const accessToken = response.access_token ?? "";
  const refreshToken = response.refresh_token ?? "";
  const claims = parseJwtPayload(idToken) ?? {};
  const email = readEmail(claims);
  const avatarUrl = readAvatar(claims);
  const accountId = response.account_id ?? readAccountId(claims);
  if (!accountId) {
    throw new Error("Token exchange succeeded but account_id is missing.");
  }

  const authJson: CodexAuthJson = {
    auth_mode: "chatgpt",
    tokens: {
      id_token: idToken,
      access_token: accessToken,
      refresh_token: refreshToken,
      account_id: accountId
    },
    last_refresh: now.toISOString(),
    account: email ? { email, avatar_url: avatarUrl } : undefined
  };

  return {
    authJson,
    accountEmail: email,
    avatarUrl
  };
}

function readEmail(claims: Record<string, unknown>): string | undefined {
  const direct = claims.email;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim().toLowerCase();
  }

  const authClaims = readAuthClaims(claims);
  const nested = authClaims?.email;
  return typeof nested === "string" && nested.trim() ? nested.trim().toLowerCase() : undefined;
}

function readAvatar(claims: Record<string, unknown>): string | undefined {
  for (const key of ["picture", "avatar_url", "avatarUrl", "image", "photo_url", "photoUrl"]) {
    const value = claims[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      return value;
    }
  }

  const authClaims = readAuthClaims(claims);
  if (!authClaims) {
    return undefined;
  }

  for (const key of ["picture", "avatar_url", "avatarUrl", "image", "photo_url", "photoUrl"]) {
    const value = authClaims[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      return value;
    }
  }
  return undefined;
}

function readAccountId(claims: Record<string, unknown>): string | undefined {
  const directKeys = ["account_id", "accountId", "chatgpt_account_id", "chatgptAccountId"];
  for (const key of directKeys) {
    const value = claims[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  const authClaims = readAuthClaims(claims);
  if (!authClaims) {
    return undefined;
  }

  for (const key of directKeys) {
    const value = authClaims[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  const organizations = authClaims.organizations;
  if (Array.isArray(organizations)) {
    for (const organization of organizations) {
      if (!organization || typeof organization !== "object") {
        continue;
      }
      const org = organization as Record<string, unknown>;
      if (org.is_default === true && typeof org.id === "string" && org.id.trim()) {
        return org.id.trim();
      }
    }
    for (const organization of organizations) {
      if (!organization || typeof organization !== "object") {
        continue;
      }
      const org = organization as Record<string, unknown>;
      if (typeof org.id === "string" && org.id.trim()) {
        return org.id.trim();
      }
    }
  }

  return undefined;
}

function readAuthClaims(claims: Record<string, unknown>): Record<string, unknown> | undefined {
  const value = claims["https://api.openai.com/auth"];
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}
