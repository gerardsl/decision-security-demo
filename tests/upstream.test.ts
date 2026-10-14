import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { logDecision } from "@/lib/log";
import { chooseRateLimitBackend, clientIp, enforceRateLimit, resolveRedisCredentials } from "@/lib/ratelimit";
import { DECISION_ENDPOINT, DecisionCallError, createDecisionCaller } from "@/lib/upstream";
import { redisMock } from "@/tests/redis-mock-state";

describe("decision upstream", () => {
  it("sends the documented system-one request and drops upstream error bodies", async () => {
    const fetchImpl = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => {
      return new Response("azure-client-secret-value in the body", { status: 500 });
    });
    const call = createDecisionCaller({
      fetchImpl,
      tokenProvider: async () => "TEST_BEARER_TOKEN_VALUE",
      endpoint: DECISION_ENDPOINT,
    });
    await expect(call({ model: "Decision-1", state: "data", questions: {} })).rejects.toEqual(
      expect.objectContaining({ name: "DecisionCallError", message: "upstream" }),
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(DECISION_ENDPOINT);
    expect(headers.get("authorization")).toBe("Bearer TEST_BEARER_TOKEN_VALUE");
    expect(String(init?.body)).toContain("\"model\":\"Decision-1\"");
    expect(String(init?.body)).not.toContain("tools");
  });

  it("maps timeouts and malformed JSON without copying the token into the error", async () => {
    const timeout = createDecisionCaller({
      fetchImpl: async () => {
        throw Object.assign(new Error("Bearer TEST_BEARER_TOKEN_VALUE"), { name: "TimeoutError" });
      },
      tokenProvider: async () => "TEST_BEARER_TOKEN_VALUE",
    });
    await expect(timeout({})).rejects.toMatchObject({ reason: "timeout", message: "timeout" });

    const malformed = createDecisionCaller({
      fetchImpl: async () => new Response("not-json TEST_BEARER_TOKEN_VALUE", { status: 200 }),
      tokenProvider: async () => "TEST_BEARER_TOKEN_VALUE",
    });
    await expect(malformed({})).rejects.toBeInstanceOf(DecisionCallError);
    try {
      await malformed({});
    } catch (error) {
      expect(error).toBeInstanceOf(DecisionCallError);
      expect((error as DecisionCallError).reason).toBe("upstream");
      expect((error as Error).message).not.toContain("TEST_BEARER_TOKEN_VALUE");
    }
  });

  it("hides token-provider failures", async () => {
    const call = createDecisionCaller({
      tokenProvider: async () => {
        throw new Error("secret azure-client-secret-value");
      },
    });
    await expect(call({})).rejects.toBeInstanceOf(DecisionCallError);
    try {
      await call({});
    } catch (error) {
      expect((error as Error).message).toBe("upstream");
    }
  });
});

describe("rate limit and logs", () => {
  it("fails closed when the shared store throws and limits passcode attempts", async () => {
    const request = new Request("http://localhost/api/decide", {
      headers: { "x-forwarded-for": "198.51.100.10, 10.0.0.1" },
    });
    expect(clientIp(request)).toBe("198.51.100.10");
    await expect(
      enforceRateLimit(request, "api", {
        limit: async () => {
          throw new Error("UPSTASH_REDIS_REST_TOKEN leaked");
        },
      }),
    ).rejects.toMatchObject({ status: 429, code: "rate_limited", message: "Too many requests.", retryAfterMs: 60_000 });

    const passcodeRequest = new Request("http://localhost/api/auth/passcode", {
      headers: { "x-forwarded-for": "198.51.100.20" },
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await enforceRateLimit(passcodeRequest, "passcode");
    }
    await expect(enforceRateLimit(passcodeRequest, "passcode")).rejects.toMatchObject({ code: "rate_limited" });

    expect(chooseRateLimitBackend({})).toBe("closed");
    expect(chooseRateLimitBackend({ VITEST: "true" })).toBe("memory");
    expect(
      chooseRateLimitBackend({
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "token",
      }),
    ).toBe("upstash");
  });

  it("uses the UPSTASH pair", () => {
    const env = {
      UPSTASH_REDIS_REST_URL: "https://upstash.example",
      UPSTASH_REDIS_REST_TOKEN: "upstash-token",
    };
    expect(resolveRedisCredentials(env)).toEqual({ url: "https://upstash.example", token: "upstash-token" });
    expect(chooseRateLimitBackend(env)).toBe("upstash");
  });

  it("uses the KV pair", () => {
    const env = {
      KV_REST_API_URL: "https://kv.example",
      KV_REST_API_TOKEN: "kv-token",
    };
    expect(resolveRedisCredentials(env)).toEqual({ url: "https://kv.example", token: "kv-token" });
    expect(chooseRateLimitBackend(env)).toBe("upstash");
  });

  it("prefers the UPSTASH pair when both pairs are set", () => {
    const env = {
      UPSTASH_REDIS_REST_URL: "https://upstash.example",
      UPSTASH_REDIS_REST_TOKEN: "upstash-token",
      KV_REST_API_URL: "https://kv.example",
      KV_REST_API_TOKEN: "kv-token",
    };
    expect(resolveRedisCredentials(env)).toEqual({ url: "https://upstash.example", token: "upstash-token" });
    expect(chooseRateLimitBackend(env)).toBe("upstash");
  });

  it("treats neither pair as absent", () => {
    expect(resolveRedisCredentials({})).toBeNull();
    expect(chooseRateLimitBackend({})).toBe("closed");
    expect(chooseRateLimitBackend({ VITEST: "true" })).toBe("memory");
  });

  it("treats a mixed or partial pair as absent", () => {
    const mixed = {
      UPSTASH_REDIS_REST_URL: "https://upstash.example",
      KV_REST_API_TOKEN: "kv-token",
    };
    expect(resolveRedisCredentials(mixed)).toBeNull();
    expect(chooseRateLimitBackend(mixed)).toBe("closed");
    expect(resolveRedisCredentials({ UPSTASH_REDIS_REST_URL: "https://upstash.example" })).toBeNull();
    expect(resolveRedisCredentials({ KV_REST_API_TOKEN: "kv-token" })).toBeNull();
    expect(
      resolveRedisCredentials({
        UPSTASH_REDIS_REST_URL: "https://upstash.example",
        KV_REST_API_URL: "https://kv.example",
        KV_REST_API_TOKEN: "kv-token",
      }),
    ).toEqual({ url: "https://kv.example", token: "kv-token" });
  });

  it("normalizes brackets, ports, mapped IPv4, and IPv6 prefixes", () => {
    const prefix = "2a09:bac5:4c1a:8f21::/64";
    const headers = (values: Record<string, string>) => new Request("http://localhost/api/decide", { headers: values });
    expect(clientIp(headers({ "x-vercel-forwarded-for": "2a09:bac5:4c1a:8f21:1111::1" }))).toBe(prefix);
    expect(clientIp(headers({ "x-forwarded-for": "2A09:BAC5:4c1a:8f21:ffff:ffff:ffff:ffff" }))).toBe(prefix);
    expect(clientIp(headers({ "x-real-ip": "[2a09:bac5:4c1a:8f21::abcd]" }))).toBe(prefix);
    expect(clientIp(headers({ "x-forwarded-for": "[2a09:bac5:4c1a:8f21:1::2]:443" }))).toBe(prefix);
    expect(clientIp(headers({ "x-forwarded-for": "198.51.100.10:8443" }))).toBe("198.51.100.10");
    expect(clientIp(headers({ "x-forwarded-for": "[::ffff:198.51.100.10]:443" }))).toBe("198.51.100.10");
    expect(clientIp(headers({ "x-forwarded-for": "::ffff:198.51.100.10" }))).toBe("198.51.100.10");
    expect(clientIp(headers({ "x-forwarded-for": "0:0:0:0:0:ffff:c633:640a" }))).toBe("198.51.100.10");
    expect(
      clientIp(
        headers({
          "x-vercel-forwarded-for": "203.0.113.5",
          "x-forwarded-for": "198.51.100.10",
          "x-real-ip": "192.0.2.9",
        }),
      ),
    ).toBe("203.0.113.5");
  });

  it("blocks when the limiter times out", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const request = new Request("http://localhost/api/decide", {
        headers: { "x-forwarded-for": "203.0.113.77" },
      });
      await expect(
        enforceRateLimit(request, "api", {
          limit: async () => ({ success: true, reset: 0, remaining: 0, reason: "timeout" }),
        }),
      ).rejects.toMatchObject({ status: 429, code: "rate_limited", retryAfterMs: 60_000 });
      const lines = info.mock.calls.map((call) => String(call[0]));
      expect(lines.join("\n")).not.toContain("203.0.113.77");
      const logged = JSON.parse(lines.at(-1) ?? "{}") as {
        key: string;
        success: boolean;
        reason: string | null;
        scope: string;
        backend: string;
        remaining: number;
        latencyMs: number;
      };
      expect(logged).toMatchObject({
        scope: "api",
        backend: "memory",
        success: false,
        reason: "timeout",
        remaining: 0,
      });
      expect(logged.key).toBe(createHash("sha256").update("api:203.0.113.77").digest("hex").slice(0, 12));
      expect(logged.latencyMs).toBeGreaterThanOrEqual(0);
    } finally {
      info.mockRestore();
    }
  });

  it("applies a passcode-wide limit across different client addresses", async () => {
    for (let host = 1; host <= 20; host += 1) {
      await enforceRateLimit(
        new Request("http://localhost/api/auth/passcode", {
          headers: { "x-forwarded-for": `198.51.100.${host}` },
        }),
        "passcode",
      );
    }
    await expect(
      enforceRateLimit(
        new Request("http://localhost/api/auth/passcode", {
          headers: { "x-forwarded-for": "203.0.113.9" },
        }),
        "passcode",
      ),
    ).rejects.toMatchObject({ status: 429, code: "rate_limited" });
    await expect(
      enforceRateLimit(
        new Request("http://localhost/api/auth/passcode", {
          headers: { "x-forwarded-for": "198.51.100.1" },
        }),
        "passcode",
      ),
    ).rejects.toMatchObject({ status: 429, code: "rate_limited" });
  });

  it("shares an Upstash window across one IPv6 prefix", async () => {
    redisMock.counts.clear();
    redisMock.configs.length = 0;
    redisMock.identifiers.length = 0;
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const address = (n: number) => `[2a09:bac5:4c1a:8f21:${n.toString(16)}::${n}]:443`;
    const call = (n: number, path: string) =>
      new Request(`http://localhost${path}`, { headers: { "x-vercel-forwarded-for": address(n) } });
    try {
      for (let n = 1; n <= 60; n += 1) {
        await enforceRateLimit(call(n, "/api/decide"), "api");
      }
      await expect(enforceRateLimit(call(61, "/api/decide"), "api")).rejects.toMatchObject({
        status: 429,
        code: "rate_limited",
      });
      for (let n = 1; n <= 5; n += 1) {
        await enforceRateLimit(call(100 + n, "/api/auth/passcode"), "passcode");
      }
      await expect(enforceRateLimit(call(200, "/api/auth/passcode"), "passcode")).rejects.toMatchObject({
        status: 429,
        code: "rate_limited",
      });
      expect(redisMock.configs.length).toBeGreaterThan(0);
      expect(redisMock.configs.every((config) => config.timeout === 1500)).toBe(true);
      expect(redisMock.identifiers).toContain("api:2a09:bac5:4c1a:8f21::/64");
      expect(redisMock.identifiers).toContain("passcode:2a09:bac5:4c1a:8f21::/64");
      expect(redisMock.identifiers).toContain("passcode:global");
      const logged = info.mock.calls.map((call) => String(call[0])).join("\n");
      expect(logged).not.toContain("2a09:bac5");
      expect(logged).not.toContain("8f21");
    } finally {
      info.mockRestore();
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    }
  });

  it("logs only the allowlisted fields", () => {
    let line = "";
    logDecision(
      {
        requestId: "req-1",
        tab: "dlp",
        latencyMs: 15,
        outcome: "block",
        reason: "score_threshold",
        decision: "score",
        token: "nope",
        input: "secret prompt",
        body: "full response",
      } as never,
      (value) => {
        line = value;
      },
    );
    expect(JSON.parse(line)).toEqual({
      requestId: "req-1",
      tab: "dlp",
      latencyMs: 15,
      outcome: "block",
      reason: "score_threshold",
      decision: "score",
    });
    expect(line).not.toContain("nope");
    expect(line).not.toContain("secret prompt");
    expect(line).not.toContain("full response");
  });
});
