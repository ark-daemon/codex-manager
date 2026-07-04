import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsageService } from "../electron/services/usageService.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "profile-switcher-usage-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("UsageService", () => {
  it("returns unavailable when auth.json is missing", async () => {
    const service = new UsageService({ fetchImpl: vi.fn() as unknown as typeof fetch });
    const result = await service.refreshForProfile(tempDir);
    expect(result.status).toBe("unavailable");
    expect(result.message).toContain("No usable ChatGPT bearer token");
  });

  it("returns unavailable when account id is missing", async () => {
    await writeAuth({ tokens: { access_token: "access-test" } });
    const service = new UsageService({ fetchImpl: vi.fn() as unknown as typeof fetch });

    const result = await service.refreshForProfile(tempDir);

    expect(result.status).toBe("unavailable");
    expect(result.message).toContain("No ChatGPT account ID");
  });

  it("returns unavailable when the endpoint does not expose Codex limits", async () => {
    await writeAuth({ tokens: { access_token: "access-test", account_id: "acct_123" } });
    const fetchImpl = vi.fn(async () => Response.json({ object: "page", data: [] })) as unknown as typeof fetch;
    const service = new UsageService({ fetchImpl });

    const result = await service.refreshForProfile(tempDir);

    expect(result.status).toBe("unavailable");
    expect(result.message).toContain("not found");
  });

  it("calls wham usage endpoint with bearer token and account id headers", async () => {
    await writeAuth({ tokens: { access_token: "access-test", account_id: "acct_123" } });
    const fetchImpl = vi.fn(async () => Response.json({
      codex_usage: {
        five_hour: { used: 8, limit: 10, reset_seconds: 300 },
        weekly: { remaining: 40, limit: 100 }
      }
    })) as unknown as typeof fetch;
    const service = new UsageService({ fetchImpl });

    await service.refreshForProfile(tempDir);

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
    expect(url).toBe("https://chatgpt.com/backend-api/wham/usage");
    expect(init).toBeDefined();
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer access-test",
      "ChatGPT-Account-Id": "acct_123"
    });
  });

  it("parses five_hour/weekly windows", async () => {
    await writeAuth({ tokens: { access_token: "access-test", account_id: "acct_123" } });
    const fetchImpl = vi.fn(async () => Response.json({
      codex_usage: {
        five_hour: { used: 8, limit: 10, reset_seconds: 300 },
        weekly: { remaining: 40, limit: 100 }
      }
    })) as unknown as typeof fetch;
    const service = new UsageService({
      fetchImpl,
      now: () => new Date("2026-05-17T00:00:00.000Z")
    });

    const result = await service.refreshForProfile(tempDir);

    expect(result.status).toBe("available");
    expect(result.fiveHour?.remaining).toBe(2);
    expect(result.fiveHour?.resetAt).toBe("2026-05-17T00:05:00.000Z");
    expect(result.weekly?.remaining).toBe(40);
    expect(service.deriveAvailability(result)).toBe("available");
  });

  it("parses alternate primary/secondary and *_limit field names", async () => {
    await writeAuth({ tokens: { access_token: "access-test", account_id: "acct_123" } });
    const fetchImpl = vi.fn(async () => Response.json({
      rate_limit: {
        primary_window: { used_percent: 25, reset_after_seconds: 600 },
        weekly_limit: { remaining: 70, limit: 100 }
      }
    })) as unknown as typeof fetch;
    const service = new UsageService({
      fetchImpl,
      now: () => new Date("2026-05-17T00:00:00.000Z")
    });

    const result = await service.refreshForProfile(tempDir);

    expect(result.status).toBe("available");
    expect(result.fiveHour?.limit).toBe(100);
    expect(result.fiveHour?.remaining).toBe(75);
    expect(result.fiveHour?.resetAt).toBe("2026-05-17T00:10:00.000Z");
    expect(result.weekly?.remaining).toBe(70);
  });

  it("keeps weekly-only plans as weekly-only pools", async () => {
    await writeAuth({ tokens: { access_token: "access-test", account_id: "acct_123" } });
    const fetchImpl = vi.fn(async () => Response.json({
      codex_usage: {
        weekly: { remaining: 3, limit: 10, reset_at: "2026-05-18T01:00:00.000Z" }
      }
    })) as unknown as typeof fetch;
    const service = new UsageService({ fetchImpl });

    const result = await service.refreshForProfile(tempDir);

    expect(result.status).toBe("available");
    expect(result.fiveHour).toBeUndefined();
    expect(result.weekly?.remaining).toBe(3);
    expect(result.pools?.map((pool) => pool.id)).toEqual(["codex-weekly"]);
  });

  it("parses a Free plan response with weekly only values", async () => {
    await writeAuth({ tokens: { access_token: "access-test", account_id: "acct_123" } });
    const fetchImpl = vi.fn(async () => Response.json({
      weekly: { remaining: 67, total: 100, resets_at: "2026-05-22T00:00:00.000Z" }
    })) as unknown as typeof fetch;
    const service = new UsageService({ fetchImpl });

    const result = await service.refreshForProfile(tempDir);

    expect(result.status).toBe("available");
    expect(result.weekly).toMatchObject({ remaining: 67, limit: 100, resetAt: "2026-05-22T00:00:00.000Z" });
    expect(result.fiveHour).toBeUndefined();
  });

  it("parses a Plus/Pro response with five-hour and weekly values", async () => {
    await writeAuth({ tokens: { access_token: "access-test", account_id: "acct_123" } });
    const fetchImpl = vi.fn(async () => Response.json({
      five_hour: { remaining: 23, total: 50, resets_at: "2026-05-17T03:00:00.000Z" },
      weekly: { remaining: 67, total: 100, resets_at: "2026-05-22T00:00:00.000Z" }
    })) as unknown as typeof fetch;
    const service = new UsageService({ fetchImpl });

    const result = await service.refreshForProfile(tempDir);

    expect(result.status).toBe("available");
    expect(result.fiveHour).toMatchObject({ remaining: 23, limit: 50 });
    expect(result.weekly).toMatchObject({ remaining: 67, limit: 100 });
    expect(result.pools?.map((pool) => pool.id)).toEqual(["codex-five-hour", "codex-weekly"]);
  });

  it("keeps five-hour-only plans as five-hour-only pools", async () => {
    await writeAuth({ tokens: { access_token: "access-test", account_id: "acct_123" } });
    const fetchImpl = vi.fn(async () => Response.json({
      codex_usage: {
        five_hour: { remaining: 4, limit: 10, reset_after_seconds: 900 }
      }
    })) as unknown as typeof fetch;
    const service = new UsageService({
      fetchImpl,
      now: () => new Date("2026-05-17T00:00:00.000Z")
    });

    const result = await service.refreshForProfile(tempDir);

    expect(result.status).toBe("available");
    expect(result.fiveHour?.remaining).toBe(4);
    expect(result.fiveHour?.resetAt).toBe("2026-05-17T00:15:00.000Z");
    expect(result.weekly).toBeUndefined();
    expect(result.pools?.map((pool) => pool.id)).toEqual(["codex-five-hour"]);
  });

  it("parses credits-only responses as credits pools", async () => {
    await writeAuth({ tokens: { access_token: "access-test", account_id: "acct_123" } });
    const fetchImpl = vi.fn(async () => Response.json({
      usage: {
        credits: { remaining: 450, total: 1000 }
      }
    })) as unknown as typeof fetch;
    const service = new UsageService({ fetchImpl });

    const result = await service.refreshForProfile(tempDir);

    expect(result.status).toBe("available");
    expect(result.credits?.remaining).toBe(450);
    expect(result.credits?.limit).toBe(1000);
    expect(result.pools?.map((pool) => pool.id)).toEqual(["codex-credits"]);
  });

  it("handles missing fields without crashing", async () => {
    await writeAuth({ tokens: { access_token: "access-test", account_id: "acct_123" } });
    const fetchImpl = vi.fn(async () => Response.json({
      codex_usage: {
        weekly: { resets_at: "2026-05-22T00:00:00.000Z" }
      }
    })) as unknown as typeof fetch;
    const service = new UsageService({ fetchImpl });

    const result = await service.refreshForProfile(tempDir);

    expect(result.status).toBe("unavailable");
    expect(result.message).toContain("not found");
  });

  it("handles network timeout without crashing", async () => {
    await writeAuth({ tokens: { access_token: "access-test", account_id: "acct_123" } });
    const fetchImpl = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      (init as RequestInit).signal?.addEventListener("abort", () => {
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    })) as unknown as typeof fetch;
    const service = new UsageService({ fetchImpl, timeoutMs: 1 });

    const result = await service.refreshForProfile(tempDir);

    expect(result.status).toBe("error");
    expect(result.message).toBe("ChatGPT quota request timed out.");
  });

  it("handles a completely empty response without crashing", async () => {
    await writeAuth({ tokens: { access_token: "access-test", account_id: "acct_123" } });
    const fetchImpl = vi.fn(async () => new Response("", { status: 200 })) as unknown as typeof fetch;
    const service = new UsageService({ fetchImpl });

    const result = await service.refreshForProfile(tempDir);

    expect(result.status).toBe("error");
    expect(result.message).toBe("ChatGPT quota request failed.");
  });

  it("detects primary_window as weekly when duration is weekly", async () => {
    await writeAuth({ tokens: { access_token: "access-test", account_id: "acct_123" } });
    const fetchImpl = vi.fn(async () => Response.json({
      rate_limit: {
        primary_window: { used_percent: 12, limit_window_seconds: 604800, reset_after_seconds: 1800 }
      }
    })) as unknown as typeof fetch;
    const service = new UsageService({
      fetchImpl,
      now: () => new Date("2026-05-17T00:00:00.000Z")
    });

    const result = await service.refreshForProfile(tempDir);

    expect(result.status).toBe("available");
    expect(result.fiveHour).toBeUndefined();
    expect(result.weekly?.remaining).toBe(88);
    expect(result.pools?.map((pool) => pool.id)).toEqual(["codex-weekly"]);
  });

  it("does not duplicate an explicit weekly window as a 5-hour quota", async () => {
    await writeAuth({ tokens: { access_token: "access-test", account_id: "acct_123" } });
    const fetchImpl = vi.fn(async () => Response.json({
      rate_limit: {
        weekly_limit: { remaining: 8, limit: 100, reset_after_seconds: 3600 },
        primary_window: { used_percent: 92, limit_window_seconds: 604800, reset_after_seconds: 3600 }
      }
    })) as unknown as typeof fetch;
    const service = new UsageService({
      fetchImpl,
      now: () => new Date("2026-05-17T00:00:00.000Z")
    });

    const result = await service.refreshForProfile(tempDir);

    expect(result.fiveHour).toBeUndefined();
    expect(result.weekly?.remaining).toBe(8);
    expect(result.pools?.map((pool) => pool.id)).toEqual(["codex-weekly"]);
  });

  it("marks exact quota as at limit when remaining is zero", async () => {
    await writeAuth({ tokens: { access_token: "access-test", account_id: "acct_123" } });
    const fetchImpl = vi.fn(async () => Response.json({
      usage: {
        fiveHour: { remaining: 0, limit: 10 },
        weekly: { remaining: 2, limit: 100 }
      }
    })) as unknown as typeof fetch;
    const service = new UsageService({ fetchImpl });

    const result = await service.refreshForProfile(tempDir);

    expect(result.status).toBe("available");
    expect(service.deriveAvailability(result)).toBe("at_limit");
  });

  it.each([401, 404])("treats HTTP %i as unavailable", async (status) => {
    await writeAuth({ tokens: { access_token: "access-test", account_id: "acct_123" } });
    const fetchImpl = vi.fn(async () => new Response("nope", { status })) as unknown as typeof fetch;
    const service = new UsageService({ fetchImpl });

    const result = await service.refreshForProfile(tempDir);

    expect(result.status).toBe("unavailable");
  });

  it("maps HTTP 403 to token expired", async () => {
    await writeAuth({ tokens: { access_token: "access-test", account_id: "acct_123" } });
    const fetchImpl = vi.fn(async () => new Response("forbidden", { status: 403 })) as unknown as typeof fetch;
    const service = new UsageService({ fetchImpl });

    const result = await service.refreshForProfile(tempDir);

    expect(result.status).toBe("unavailable");
    expect(result.message).toBe("Token expired");
  });
});

async function writeAuth(content: unknown) {
  await fs.mkdir(path.join(tempDir, "codex-agent"), { recursive: true });
  await fs.writeFile(path.join(tempDir, "codex-agent", "auth.json"), JSON.stringify(content), "utf8");
}
