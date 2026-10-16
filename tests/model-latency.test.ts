import { describe, expect, it } from "vitest";
import type { DecideRequest } from "@/lib/contract";
import { decide } from "@/lib/decide";
import { modelServerTiming, modelTimingHeaders } from "@/lib/model-timing";
import { createDecisionCaller } from "@/lib/upstream";

const YES = { answers: { verdict: { type: "noul", noul: 0.92 } } };

const phishing: DecideRequest = {
  tab: "phishing",
  input: { sender: "a@b.co", subject: "Hi", body: "Hello" },
};

const mcp: DecideRequest = {
  tab: "mcp",
  input: { toolName: "search_docs", args: {}, agentContext: "demo" },
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("model latency window", () => {
  it("times the fetch through the body and leaves token time outside modelMs", async () => {
    const origin = performance.now();
    let fetchStarted = 0;
    let bodyEnded = 0;
    const caller = createDecisionCaller({
      tokenProvider: async () => {
        await delay(80);
        return "TEST_BEARER_TOKEN_VALUE";
      },
      fetchImpl: async () => {
        fetchStarted = performance.now();
        await delay(20);
        return {
          ok: true,
          json: async () => {
            await delay(20);
            bodyEnded = performance.now();
            return YES;
          },
        } as Response;
      },
    });
    const started = Date.now();
    const settled = await decide(phishing, { callDecision: caller });
    const latencyMs = Date.now() - started;
    const span = bodyEnded - fetchStarted;
    expect(settled).toMatchObject({ outcome: "allow", reason: "ok", modelStatus: "ok" });
    expect(Number.isFinite(settled.modelMs)).toBe(true);
    expect(settled.modelMs).toBeGreaterThanOrEqual(Math.round(span) - 5);
    expect(settled.modelMs).toBeLessThanOrEqual(Math.round(span) + 20);
    expect(performance.now() - origin - (settled.modelMs ?? 0)).toBeGreaterThanOrEqual(60);
    expect(settled.modelMs).toBeLessThanOrEqual(latencyMs);
    expect(modelServerTiming(settled.modelMs ?? 0)).toBe(`model;dur=${settled.modelMs}`);
    expect(modelTimingHeaders(settled)).toEqual({ "Server-Timing": `model;dur=${settled.modelMs}` });
    expect(JSON.stringify(settled)).not.toContain("TEST_BEARER_TOKEN_VALUE");
  });

  it("leaves modelMs null on timeout and preserves fail-open and fail-closed", async () => {
    const caller = createDecisionCaller({
      tokenProvider: async () => "TEST_BEARER_TOKEN_VALUE",
      fetchImpl: async () => {
        await delay(30);
        throw Object.assign(new Error("Bearer TEST_BEARER_TOKEN_VALUE"), { name: "TimeoutError" });
      },
    });
    const open = await decide(phishing, { callDecision: caller });
    expect(open).toMatchObject({
      outcome: "undecided",
      reason: "timeout",
      httpStatus: 502,
      modelMs: null,
      modelStatus: "timeout",
    });
    expect(JSON.stringify(open)).not.toContain("TEST_BEARER_TOKEN_VALUE");
    expect(modelTimingHeaders(open)).toBeUndefined();

    const closed = await decide(mcp, { callDecision: caller });
    expect(closed).toMatchObject({
      outcome: "block",
      reason: "timeout",
      httpStatus: 502,
      modelMs: null,
      modelStatus: "timeout",
    });
    expect(modelTimingHeaders(closed)).toBeUndefined();
  });

  it("leaves modelMs null for HTTP and JSON failures and does not read an error body", async () => {
    let read = false;
    const http = createDecisionCaller({
      tokenProvider: async () => "TEST_BEARER_TOKEN_VALUE",
      fetchImpl: async () => {
        await delay(20);
        return {
          ok: false,
          json: async () => {
            read = true;
            return { secret: "azure-client-secret-value" };
          },
          text: async () => {
            read = true;
            return "azure-client-secret-value";
          },
        } as Response;
      },
    });
    const failed = await decide(phishing, { callDecision: http });
    expect(failed).toMatchObject({
      outcome: "undecided",
      reason: "upstream_error",
      httpStatus: 502,
      modelMs: null,
      modelStatus: "error",
    });
    expect(read).toBe(false);
    expect(JSON.stringify(failed)).not.toContain("azure-client-secret-value");

    const malformed = createDecisionCaller({
      tokenProvider: async () => "TEST_BEARER_TOKEN_VALUE",
      fetchImpl: async () => new Response("not-json TEST_BEARER_TOKEN_VALUE", { status: 200 }),
    });
    const badJson = await decide(mcp, { callDecision: malformed });
    expect(badJson).toMatchObject({
      outcome: "block",
      reason: "upstream_error",
      httpStatus: 502,
      modelMs: null,
      modelStatus: "error",
    });
    expect(modelTimingHeaders(badJson)).toBeUndefined();
    expect(JSON.stringify(badJson)).not.toContain("TEST_BEARER_TOKEN_VALUE");
    expect(JSON.stringify(badJson)).not.toContain("not-json");
  });

  it("keeps modelStatus ok when a fully read body fails later parsing", async () => {
    const caller = createDecisionCaller({
      tokenProvider: async () => "TEST_BEARER_TOKEN_VALUE",
      fetchImpl: async () =>
        new Response(JSON.stringify({ answers: { verdict: { type: "noul", noul: 4 } } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    const started = Date.now();
    const settled = await decide(phishing, { callDecision: caller });
    const latencyMs = Date.now() - started;
    expect(settled).toMatchObject({
      outcome: "undecided",
      reason: "upstream_error",
      httpStatus: 502,
      modelStatus: "ok",
    });
    expect(Number.isFinite(settled.modelMs)).toBe(true);
    expect(settled.modelMs).toBeLessThanOrEqual(latencyMs + 1);
    expect(modelTimingHeaders(settled)).toEqual({ "Server-Timing": `model;dur=${settled.modelMs}` });
  });

  it("leaves modelMs null when the token fails before fetch", async () => {
    let fetched = false;
    const caller = createDecisionCaller({
      tokenProvider: async () => {
        throw new Error("secret azure-client-secret-value");
      },
      fetchImpl: async () => {
        fetched = true;
        return new Response("{}", { status: 200 });
      },
    });
    const settled = await decide(mcp, { callDecision: caller });
    expect(fetched).toBe(false);
    expect(settled).toMatchObject({
      outcome: "block",
      reason: "upstream_error",
      httpStatus: 502,
      modelMs: null,
      modelStatus: "error",
    });
    expect(JSON.stringify(settled)).not.toContain("azure-client-secret-value");
    expect(modelTimingHeaders(settled)).toBeUndefined();
  });

  it("leaves both fields null when the tool name never reaches the model", async () => {
    const settled = await decide(
      { tab: "mcp", input: { toolName: "bad name", args: {}, agentContext: "" } },
      {
        callDecision: async () => {
          throw new Error("should not call");
        },
      },
    );
    expect(settled).toMatchObject({
      reason: "invalid_tool_name",
      outcome: "block",
      httpStatus: 200,
      modelMs: null,
      modelStatus: null,
    });
  });
});
