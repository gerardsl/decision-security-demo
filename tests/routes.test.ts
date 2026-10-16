import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as decideRoute } from "@/app/api/decide/route";
import { POST as arenaRoute } from "@/app/api/arena/round/route";
import { POST as passcodeRoute } from "@/app/api/auth/passcode/route";
import { apiErrorSchema, decideResponseSchema } from "@/lib/contract";
import { LIMITS } from "@/lib/contract";
import { timedModelBody } from "@/lib/model-timing";
import { DecisionCallError } from "@/lib/upstream";
import { AZURE_CLIENT_SECRET, DEMO_PASSCODE, authHeaders, postJson } from "@/tests/helpers";

const { callDecision } = vi.hoisted(() => ({ callDecision: vi.fn() }));

vi.mock("@/lib/upstream", () => {
  class DecisionCallError extends Error {
    readonly reason: "timeout" | "upstream";
    readonly modelMs: number | null;
    constructor(reason: "timeout" | "upstream", modelMs: number | null = null) {
      super(reason);
      this.name = "DecisionCallError";
      this.reason = reason;
      this.modelMs = modelMs;
    }
  }
  return {
    DecisionCallError,
    createDecisionCaller: () => callDecision,
  };
});

describe("API routes", () => {
  beforeEach(() => {
    callDecision.mockReset();
    callDecision.mockResolvedValue({ answers: { verdict: { type: "noul", noul: 0.92 } } });
  });

  it("returns 400, 401, 429, and 502", async () => {
    const missing = await decideRoute(
      postJson("http://localhost/api/decide", { tab: "phishing", input: { sender: "a@b.co", subject: "Hi", body: "Hello" } }, new Headers({
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.40",
      })),
    );
    expect(missing.status).toBe(401);
    expect(missing.headers.get("server-timing")).toBeNull();
    expect(apiErrorSchema.safeParse(await missing.json()).success).toBe(true);

    const invalid = await decideRoute(
      postJson("http://localhost/api/decide", { tab: "phishing", input: { sender: "" } }, authHeaders("203.0.113.41")),
    );
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("server-timing")).toBeNull();
    const invalidBody = await invalid.json();
    expect(invalidBody).toMatchObject({ error: { code: "bad_request" } });
    expect(apiErrorSchema.safeParse(invalidBody).success).toBe(true);

    callDecision.mockResolvedValueOnce({ answers: { verdict: { type: "noul", noul: 4, leaked: AZURE_CLIENT_SECRET } } });
    const malformed = await decideRoute(
      postJson(
        "http://localhost/api/decide",
        { tab: "phishing", input: { sender: "a@b.co", subject: "Hi", body: "Hello" } },
        authHeaders("203.0.113.42"),
      ),
    );
    expect(malformed.status).toBe(502);
    const malformedText = await malformed.text();
    expect(malformedText).not.toContain(AZURE_CLIENT_SECRET);
    expect(JSON.parse(malformedText)).toMatchObject({
      outcome: "undecided",
      reason: "upstream_error",
      modelMs: null,
      modelStatus: "error",
    });
    expect(malformed.headers.get("server-timing")).toBe("model;dur=0");
    expect(decideResponseSchema.safeParse(JSON.parse(malformedText)).success).toBe(true);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const denied = await passcodeRoute(
        postJson(
          "http://localhost/api/auth/passcode",
          { passcode: "wrong-passcode" },
          new Headers({ "content-type": "application/json", "x-forwarded-for": "203.0.113.70" }),
        ),
      );
      expect(denied.status).toBe(401);
    }
    const limited = await passcodeRoute(
      postJson(
        "http://localhost/api/auth/passcode",
        { passcode: DEMO_PASSCODE },
        new Headers({ "content-type": "application/json", "x-forwarded-for": "203.0.113.70" }),
      ),
    );
    expect(limited.status).toBe(429);
    const limitedBody = await limited.json();
    expect(limitedBody.retryAfterMs).toEqual(expect.any(Number));
    expect(limitedBody.retryAfterMs).toBeGreaterThan(0);
    expect(apiErrorSchema.safeParse(limitedBody).success).toBe(true);
    expect(JSON.stringify(limitedBody)).not.toContain(DEMO_PASSCODE);
  });

  it("rejects oversized bodies and does not echo secrets into logs or responses", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((line) => {
      logs.push(String(line));
    });
    const marker = "BODY_MARKER_SHOULD_NOT_LEAK";
    const response = await decideRoute(
      postJson(
        "http://localhost/api/decide",
        {
          tab: "phishing",
          input: { sender: "a@b.co", subject: marker, body: AZURE_CLIENT_SECRET },
        },
        authHeaders("203.0.113.43"),
      ),
    );
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(decideResponseSchema.safeParse(JSON.parse(text)).success).toBe(true);
    expect(text).not.toContain(AZURE_CLIENT_SECRET);
    expect(text).not.toContain(marker);
    expect(JSON.parse(text)).toMatchObject({ modelMs: null, modelStatus: null });
    expect(response.headers.get("server-timing")).toBe("model;dur=0");
    expect(logs.join("\n")).not.toContain(AZURE_CLIENT_SECRET);
    expect(logs.join("\n")).not.toContain(marker);
    expect(logs.join("\n")).not.toContain(process.env.SESSION_SECRET);
    const logged = JSON.parse(logs.at(-1) ?? "{}") as Record<string, unknown>;
    expect(logged).toMatchObject({
      tab: "phishing",
      outcome: "allow",
      reason: "ok",
      decision: "yesno",
    });
    expect(Object.keys(logged).sort()).toEqual(["decision", "latencyMs", "outcome", "reason", "requestId", "tab"]);
    spy.mockRestore();

    const oversized = await decideRoute(
      postJson(
        "http://localhost/api/decide",
        { tab: "dlp", input: { prompt: "a".repeat(LIMITS.maxBodyBytes) } },
        authHeaders("203.0.113.44"),
      ),
    );
    expect(oversized.status).toBe(400);
    expect(await oversized.json()).toMatchObject({ error: { code: "bad_request", message: "Request body is too large." } });
  });

  it("returns 502 when a choice key is outside the server template", async () => {
    callDecision.mockResolvedValueOnce({
      model: "microsoft-decision-1",
      answers: {
        verdict: {
          type: "choice",
          choice: "engineering",
          confidence: 0.998,
          probabilities: { engineering: 0.998, benign: 0.002 },
          extra: "not-copied",
        },
      },
    });
    const response = await decideRoute(
      postJson(
        "http://localhost/api/decide",
        {
          tab: "soc",
          input: {
            alertId: "a-1",
            title: "Login burst",
            severity: "high",
            source: "edr",
            description: "Many failures",
          },
        },
        authHeaders("203.0.113.48"),
      ),
    );
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({ outcome: "undecided", reason: "invalid_option" });
    expect(JSON.stringify(body)).not.toContain("engineering");
    expect(JSON.stringify(body)).not.toContain("microsoft-decision-1");
  });

  it("applies a fault header only when fault injection is enabled", async () => {
    process.env.DEMO_FAULT_INJECTION = "1";
    const blocked = await decideRoute(
      postJson(
        "http://localhost/api/decide",
        { tab: "mcp", input: { toolName: "send", args: {}, agentContext: "demo" } },
        authHeaders("203.0.113.45", { "x-demo-fault": "timeout" }),
      ),
    );
    const blockedBody = await blocked.json();
    expect(blocked.status).toBe(502);
    expect(decideResponseSchema.safeParse(blockedBody).success).toBe(true);
    expect(blockedBody).toMatchObject({
      outcome: "block",
      reason: "timeout",
      modelMs: null,
      modelStatus: "timeout",
    });
    expect(blocked.headers.get("server-timing")).toBe("model;dur=0");
    expect(callDecision).not.toHaveBeenCalled();

    delete process.env.DEMO_FAULT_INJECTION;
    callDecision.mockClear();
    const decided = await decideRoute(
      postJson(
        "http://localhost/api/decide",
        { tab: "arena", input: { prompt: "ordinary question" } },
        authHeaders("203.0.113.46", { "x-demo-fault": "timeout" }),
      ),
    );
    const decidedBody = await decided.json();
    expect(decided.status).toBe(200);
    expect(decidedBody).toMatchObject({ outcome: "allow", reason: "ok" });
    expect(callDecision).toHaveBeenCalledOnce();
  });

  it("returns 502 decision bodies for malformed and badoption faults", async () => {
    process.env.DEMO_FAULT_INJECTION = "1";
    const logs: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((line) => {
      logs.push(String(line));
    });
    try {
      const guardrails = [
        { tab: "mcp" as const, input: { toolName: "send", args: {}, agentContext: "demo" }, ip: "203.0.113.51" },
        { tab: "dlp" as const, input: { prompt: "customer list" }, ip: "203.0.113.52" },
        { tab: "arena" as const, input: { prompt: "ordinary question" }, ip: "203.0.113.53" },
      ];
      for (const item of guardrails) {
        const response = await decideRoute(
          postJson("http://localhost/api/decide", { tab: item.tab, input: item.input }, authHeaders(item.ip, { "x-demo-fault": "malformed" })),
        );
        const body = await response.json();
        expect(response.status).toBe(502);
        expect(decideResponseSchema.safeParse(body).success).toBe(true);
        expect(body).toMatchObject({ outcome: "block", reason: "upstream_error" });
        expect(JSON.stringify(body)).not.toContain("UPSTREAM_SHAPE_LEAK");
      }

      for (const [tab, input, ip] of [
        ["phishing", { sender: "a@b.co", subject: "Hi", body: "Hello" }, "203.0.113.54"],
        ["soc", { alertId: "a-1", title: "Login burst", severity: "high", source: "edr", description: "Many failures" }, "203.0.113.55"],
      ] as const) {
        const response = await decideRoute(
          postJson("http://localhost/api/decide", { tab, input }, authHeaders(ip, { "x-demo-fault": "malformed" })),
        );
        const body = await response.json();
        expect(response.status).toBe(502);
        expect(body).toMatchObject({ outcome: "undecided", reason: "upstream_error" });
      }

      const badOption = await decideRoute(
        postJson(
          "http://localhost/api/decide",
          {
            tab: "soc",
            input: {
              alertId: "a-2",
              title: "Login burst",
              severity: "high",
              source: "edr",
              description: "Many failures",
            },
          },
          authHeaders("203.0.113.56", { "x-demo-fault": "badoption" }),
        ),
      );
      const badBody = await badOption.json();
      expect(badOption.status).toBe(502);
      expect(decideResponseSchema.safeParse(badBody).success).toBe(true);
      expect(badBody).toMatchObject({ outcome: "undecided", reason: "invalid_option" });
      expect(JSON.stringify(badBody)).not.toContain("engineering");

      const badLegend = await decideRoute(
        postJson(
          "http://localhost/api/decide",
          { tab: "dlp", input: { prompt: "customer list" } },
          authHeaders("203.0.113.58", { "x-demo-fault": "badlegend" }),
        ),
      );
      const legendBody = await badLegend.json();
      expect(badLegend.status).toBe(502);
      expect(decideResponseSchema.safeParse(legendBody).success).toBe(true);
      expect(legendBody).toMatchObject({ outcome: "block", reason: "invalid_option", decision: { type: "score" } });
      expect(JSON.stringify(legendBody)).not.toContain("not-a-level");

      const upstream = await decideRoute(
        postJson(
          "http://localhost/api/decide",
          { tab: "dlp", input: { prompt: "do not log this prompt" } },
          authHeaders("203.0.113.57", { "x-demo-fault": "upstream" }),
        ),
      );
      const upstreamBody = await upstream.json();
      expect(upstream.status).toBe(502);
      expect(decideResponseSchema.safeParse(upstreamBody).success).toBe(true);
      expect(upstreamBody).toMatchObject({ outcome: "block", reason: "upstream_error", decision: { type: "score" } });
      expect(callDecision).not.toHaveBeenCalled();

      const logged = JSON.parse(logs.at(-1) ?? "{}") as Record<string, unknown>;
      expect(logged).toMatchObject({
        tab: "dlp",
        outcome: "block",
        reason: "upstream_error",
        decision: "score",
      });
      expect(Object.keys(logged).sort()).toEqual(["decision", "latencyMs", "outcome", "reason", "requestId", "tab"]);
      expect(logs.join("\n")).not.toContain("do not log this prompt");
    } finally {
      delete process.env.DEMO_FAULT_INJECTION;
      spy.mockRestore();
    }
  });

  it("returns a fixture attack without trusting history text", async () => {
    const response = await arenaRoute(
      postJson("http://localhost/api/arena/round", {}, authHeaders("203.0.113.47")),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.round).toBe(1);
    expect(body.attack.prompt.length).toBeGreaterThan(0);
    expect(body.verdict).toMatchObject({ outcome: "allow", reason: "ok", modelMs: null, modelStatus: null });
    expect(response.headers.get("server-timing")).toBe("model;dur=0");
    const judged = callDecision.mock.calls[0]?.[0] as { questions: { verdict: { instructions: string } } };
    expect(judged.questions.verdict.instructions).not.toContain(body.attack.prompt);
  });

  it("returns modelMs at or under latencyMs and always sends Server-Timing", async () => {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    callDecision.mockImplementation(async () => {
      const started = performance.now();
      await delay(40);
      return timedModelBody(
        { answers: { verdict: { type: "noul", noul: 0.92 } } },
        Math.floor(performance.now() - started),
      );
    });
    const response = await decideRoute(
      postJson(
        "http://localhost/api/decide",
        { tab: "phishing", input: { sender: "a@b.co", subject: "Hi", body: "Hello" } },
        authHeaders("203.0.113.80"),
      ),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(decideResponseSchema.safeParse(body).success).toBe(true);
    expect(body.modelStatus).toBe("ok");
    expect(Number.isInteger(body.modelMs)).toBe(true);
    expect(body.modelMs).toBeGreaterThan(0);
    expect(body.modelMs).toBeLessThanOrEqual(body.latencyMs);
    expect(response.headers.get("server-timing")).toBe(`model;dur=${body.modelMs}`);

    callDecision.mockImplementation(async () => {
      const started = performance.now();
      await delay(30);
      throw new DecisionCallError("timeout", Math.floor(performance.now() - started));
    });
    const timedOut = await decideRoute(
      postJson(
        "http://localhost/api/decide",
        { tab: "phishing", input: { sender: "a@b.co", subject: "Hi", body: "Hello" } },
        authHeaders("203.0.113.81"),
      ),
    );
    const timedOutBody = await timedOut.json();
    expect(timedOut.status).toBe(502);
    expect(timedOutBody).toMatchObject({ outcome: "undecided", reason: "timeout", modelStatus: "timeout" });
    expect(timedOutBody.modelMs).toBeLessThanOrEqual(timedOutBody.latencyMs);
    expect(timedOut.headers.get("server-timing")).toBe(`model;dur=${timedOutBody.modelMs}`);

    const closed = await decideRoute(
      postJson(
        "http://localhost/api/decide",
        { tab: "mcp", input: { toolName: "search_docs", args: {}, agentContext: "demo" } },
        authHeaders("203.0.113.82"),
      ),
    );
    const closedBody = await closed.json();
    expect(closed.status).toBe(502);
    expect(closedBody).toMatchObject({ outcome: "block", reason: "timeout", modelStatus: "timeout" });
    expect(closedBody.modelMs).toBeLessThanOrEqual(closedBody.latencyMs);
    expect(closed.headers.get("server-timing")).toBe(`model;dur=${closedBody.modelMs}`);

    callDecision.mockRejectedValue(new DecisionCallError("upstream", 0));
    const errored = await decideRoute(
      postJson(
        "http://localhost/api/decide",
        { tab: "dlp", input: { prompt: "customer list" } },
        authHeaders("203.0.113.83"),
      ),
    );
    const erroredBody = await errored.json();
    expect(errored.status).toBe(502);
    expect(erroredBody).toMatchObject({
      outcome: "block",
      reason: "upstream_error",
      modelMs: 0,
      modelStatus: "error",
    });
    expect(errored.headers.get("server-timing")).toBe("model;dur=0");

    callDecision.mockClear();
    const local = await decideRoute(
      postJson(
        "http://localhost/api/decide",
        { tab: "mcp", input: { toolName: "bad name", args: {}, agentContext: "demo" } },
        authHeaders("203.0.113.84"),
      ),
    );
    const localBody = await local.json();
    expect(local.status).toBe(200);
    expect(localBody).toMatchObject({
      outcome: "block",
      reason: "invalid_tool_name",
      modelMs: null,
      modelStatus: null,
    });
    expect(local.headers.get("server-timing")).toBe("model;dur=0");
    expect(callDecision).not.toHaveBeenCalled();
  });
});
