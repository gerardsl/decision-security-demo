import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as decideRoute } from "@/app/api/decide/route";
import { POST as arenaRoute } from "@/app/api/arena/round/route";
import { POST as passcodeRoute } from "@/app/api/auth/passcode/route";
import { apiErrorSchema, decideResponseSchema } from "@/lib/contract";
import { LIMITS } from "@/lib/contract";
import { AZURE_CLIENT_SECRET, DEMO_PASSCODE, authHeaders, postJson } from "@/tests/helpers";

const { callDecision } = vi.hoisted(() => ({ callDecision: vi.fn() }));

vi.mock("@/lib/upstream", () => {
  class DecisionCallError extends Error {
    readonly reason: "timeout" | "upstream";
    constructor(reason: "timeout" | "upstream") {
      super(reason);
      this.name = "DecisionCallError";
      this.reason = reason;
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
    expect(apiErrorSchema.safeParse(await missing.json()).success).toBe(true);

    const invalid = await decideRoute(
      postJson("http://localhost/api/decide", { tab: "phishing", input: { sender: "" } }, authHeaders("203.0.113.41")),
    );
    expect(invalid.status).toBe(400);
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
    expect(apiErrorSchema.safeParse(JSON.parse(malformedText)).success).toBe(true);

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
    expect(logs.join("\n")).not.toContain(AZURE_CLIENT_SECRET);
    expect(logs.join("\n")).not.toContain(marker);
    expect(logs.join("\n")).not.toContain(process.env.SESSION_SECRET);
    const logged = JSON.parse(logs.at(-1) ?? "{}") as Record<string, unknown>;
    expect(Object.keys(logged).sort()).toEqual(["decision", "latencyMs", "requestId", "status", "tab"]);
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
    expect(blocked.status).toBe(200);
    expect(blockedBody).toMatchObject({ status: "blocked", reason: "timeout" });
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
    expect(decidedBody.status).toBe("decided");
    expect(callDecision).toHaveBeenCalledOnce();
  });

  it("returns a fixture attack without trusting history text", async () => {
    const response = await arenaRoute(
      postJson("http://localhost/api/arena/round", {}, authHeaders("203.0.113.47")),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.round).toBe(1);
    expect(body.attack.prompt.length).toBeGreaterThan(0);
    expect(body.verdict.status).toBe("decided");
    const judged = callDecision.mock.calls[0]?.[0] as { questions: { verdict: { instructions: string } } };
    expect(judged.questions.verdict.instructions).not.toContain(body.attack.prompt);
  });
});
