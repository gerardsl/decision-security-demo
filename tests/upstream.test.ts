import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http";
import { logDecision } from "@/lib/log";
import { chooseRateLimitBackend, clientIp, enforceRateLimit } from "@/lib/ratelimit";
import { DECISION_ENDPOINT, DecisionCallError, createDecisionCaller } from "@/lib/upstream";

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
    await expect(malformed({})).rejects.toBeInstanceOf(ApiError);
    try {
      await malformed({});
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(502);
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

  it("logs only the allowlisted fields", () => {
    let line = "";
    logDecision({ requestId: "req-1", tab: "dlp", latencyMs: 15, decision: "score", status: "block", token: "nope" } as never, (value) => {
      line = value;
    });
    expect(JSON.parse(line)).toEqual({
      requestId: "req-1",
      tab: "dlp",
      latencyMs: 15,
      decision: "score",
      status: "block",
    });
    expect(line).not.toContain("nope");
  });
});
