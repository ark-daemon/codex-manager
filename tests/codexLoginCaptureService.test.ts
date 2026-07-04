import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexLoginCaptureService } from "../electron/services/codexLoginCaptureService.js";

describe("CodexLoginCaptureService", () => {
  // Store {service, captureId} so afterEach can always close the HTTP server.
  let cleanup: { service: CodexLoginCaptureService; captureId: string } | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup.service.cancelCapture(cleanup.captureId).catch(() => undefined);
      cleanup = undefined;
    }
    vi.restoreAllMocks();
  });

  it("starts PKCE login, accepts callback, exchanges code, and returns auth.json", async () => {
    const openExternal = vi.fn(async () => undefined);
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const bodyText = String(init?.body ?? "");
      expect(bodyText).toContain("grant_type=authorization_code");
      expect(bodyText).toContain("code=oauth-code-123");
      expect(bodyText).toContain("code_verifier=");
      return Response.json({
        access_token: "access-token",
        refresh_token: "refresh-token",
        id_token: makeJwt({
          email: "person@example.com",
          "https://api.openai.com/auth": {
            chatgpt_account_id: "acct_123"
          }
        })
      });
    }) as unknown as typeof fetch;

    const service = new CodexLoginCaptureService({
      openExternal,
      fetchImpl,
      timeoutMs: 4000
    });

    const session = await service.startCapture();
    cleanup = { service, captureId: session.captureId };
    expect(session.authorizationUrl).toContain("https://auth.openai.com/oauth/authorize");

    const authUrl = new URL(session.authorizationUrl);
    const state = authUrl.searchParams.get("state");
    expect(state).toBeTruthy();
    expect(authUrl.searchParams.get("scope")).toBe("openid profile email offline_access");
    expect(authUrl.searchParams.get("id_token_add_organizations")).toBe("true");
    expect(authUrl.searchParams.get("codex_cli_simplified_flow")).toBe("true");
    expect(authUrl.searchParams.get("originator")).toBe("codex_manager");

    await service.openLoginPage(session.captureId);
    expect(openExternal).toHaveBeenCalledWith(session.authorizationUrl);

    const waiting = service.waitForCapture(session.captureId);
    const callback = await fetch(`http://127.0.0.1:1455/auth/callback?code=oauth-code-123&state=${encodeURIComponent(state ?? "")}`);
    expect(callback.status).toBe(200);

    const capture = await waiting;
    expect(fetchImpl).toHaveBeenCalledWith("https://auth.openai.com/oauth/token", expect.any(Object));
    expect(capture.accountEmail).toBe("person@example.com");
    expect(capture.authJson.tokens?.account_id).toBe("acct_123");
    expect(capture.authJson.tokens?.access_token).toBe("access-token");
  });

  it("cancels in-progress login sessions", async () => {
    const service = new CodexLoginCaptureService({
      openExternal: async () => undefined,
      fetchImpl: vi.fn() as unknown as typeof fetch,
      timeoutMs: 4000
    });

    const session = await service.startCapture();
    cleanup = { service, captureId: session.captureId };
    const waiting = service.waitForCapture(session.captureId);
    await service.cancelCapture(session.captureId);

    await expect(waiting).rejects.toThrow("Login cancelled");
  });

  it("ignores a stale-state redirect and keeps the session alive for the correct callback", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        access_token: "tok-a",
        refresh_token: "ref-a",
        id_token: makeJwt({
          email: "second@example.com",
          "https://api.openai.com/auth": { chatgpt_account_id: "acct_2" }
        })
      })
    ) as unknown as typeof fetch;

    const service = new CodexLoginCaptureService({
      openExternal: async () => undefined,
      fetchImpl,
      timeoutMs: 4000
    });

    const session = await service.startCapture();
    cleanup = { service, captureId: session.captureId };
    const authUrl = new URL(session.authorizationUrl);
    const correctState = authUrl.searchParams.get("state") ?? "";

    const waiting = service.waitForCapture(session.captureId);

    // Simulate a stale redirect from the FIRST account's flow — wrong state.
    const stale = await fetch(`http://127.0.0.1:1455/auth/callback?code=old-code&state=stale-state-from-first-account`);
    expect(stale.status).toBe(400);
    const staleText = await stale.text();
    expect(staleText).toContain("State mismatch");

    // Session must still be alive — send the correct callback now.
    const good = await fetch(`http://127.0.0.1:1455/auth/callback?code=good-code&state=${encodeURIComponent(correctState)}`);
    expect(good.status).toBe(200);

    const capture = await waiting;
    expect(capture.accountEmail).toBe("second@example.com");
  });
});

function makeJwt(payload: Record<string, unknown>): string {
  const header = { alg: "none", typ: "JWT" };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${encode(header)}.${encode(payload)}.x`;
}
