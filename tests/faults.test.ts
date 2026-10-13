import { describe, expect, it, vi } from "vitest";
import type { DecideRequest } from "@/lib/contract";
import { decide } from "@/lib/decide";
import { readDemoFault } from "@/lib/faults";
import { badOptionPayload, lowConfidencePayload, malformedPayload } from "@/lib/questions";
import { DecisionCallError } from "@/lib/upstream";
import { SESSION_COOKIE } from "@/lib/session";
import { sessionCookie } from "@/tests/helpers";

const mcpInput = {
  tab: "mcp" as const,
  input: { toolName: "list_files", args: { dir: "demo" }, agentContext: "List demo files" },
};

describe("fault injection", () => {
  it("honors the header only when the flag and a valid session are both present", () => {
    const secret = process.env.SESSION_SECRET ?? "";
    const allowed = new Request("http://localhost/api/decide", {
      headers: { "x-demo-fault": "timeout", cookie: sessionCookie(secret) },
    });
    expect(readDemoFault(allowed, { ...process.env, DEMO_FAULT_INJECTION: "1", SESSION_SECRET: secret })).toBe(
      "timeout",
    );
    expect(readDemoFault(allowed, { ...process.env, DEMO_FAULT_INJECTION: "0", SESSION_SECRET: secret })).toBeNull();
    expect(readDemoFault(allowed, { ...process.env, SESSION_SECRET: secret })).toBeNull();
    expect(
      readDemoFault(allowed, {
        ...process.env,
        DEMO_FAULT_INJECTION: "1",
        SESSION_SECRET: secret,
        VERCEL_ENV: "production",
      }),
    ).toBeNull();

    const anonymous = new Request("http://localhost/api/decide", {
      headers: { "x-demo-fault": "upstream" },
    });
    expect(readDemoFault(anonymous, { DEMO_FAULT_INJECTION: "1", SESSION_SECRET: secret })).toBeNull();
    expect(readDemoFault(allowed, { DEMO_FAULT_INJECTION: "1", SESSION_SECRET: "too-short" })).toBeNull();

    const unknown = new Request("http://localhost/api/decide", {
      headers: { "x-demo-fault": "panic", cookie: `${SESSION_COOKIE}=${sessionCookie(secret).split("=")[1]}` },
    });
    expect(readDemoFault(unknown, { DEMO_FAULT_INJECTION: "1", SESSION_SECRET: secret })).toBeNull();

    const enabled = { DEMO_FAULT_INJECTION: "1", SESSION_SECRET: secret };
    for (const fault of ["malformed", "badoption"] as const) {
      const request = new Request("http://localhost/api/decide", {
        headers: { "x-demo-fault": fault, cookie: sessionCookie(secret) },
      });
      expect(readDemoFault(request, enabled)).toBe(fault);
    }
  });

  it("sends timeout, upstream, and low confidence through the same path as real failures", async () => {
    const callDecision = vi.fn(async () => {
      throw new DecisionCallError("timeout");
    });
    const thrown = await decide(mcpInput, { callDecision });
    const faulted = await decide(mcpInput, {
      fault: "timeout",
      callDecision: async () => {
        throw new Error("fault must not call upstream");
      },
    });
    expect(faulted).toEqual(thrown);
    expect(faulted).toMatchObject({
      outcome: "block",
      reason: "timeout",
      confidence: 0,
      httpStatus: 502,
      decision: { type: "yesno", value: false },
    });

    const upstreamThrown = await decide(mcpInput, {
      callDecision: async () => {
        throw new DecisionCallError("upstream");
      },
    });
    const upstreamFault = await decide(mcpInput, { fault: "upstream" });
    expect(upstreamFault).toEqual(upstreamThrown);
    expect(upstreamFault).toMatchObject({ outcome: "block", reason: "upstream_error", httpStatus: 502 });

    const payloadCaller = vi.fn(async () => lowConfidencePayload("mcp"));
    const fromPayload = await decide(mcpInput, { callDecision: payloadCaller });
    const fromFault = await decide(mcpInput, {
      fault: "lowconf",
      callDecision: async () => {
        throw new Error("fault must not call upstream");
      },
    });
    expect(fromFault).toEqual(fromPayload);
    expect(fromFault).toMatchObject({ outcome: "block", reason: "low_confidence", httpStatus: 200 });
    expect(payloadCaller).toHaveBeenCalledOnce();
  });

  it("parses a malformed fault response into upstream_error", async () => {
    for (const tab of ["mcp", "dlp", "arena"] as const) {
      const settled = await settledFault(requests[tab], "malformed");
      expect(settled).toMatchObject({ outcome: "block", reason: "upstream_error", httpStatus: 502 });
      expect(JSON.stringify(settled)).not.toContain("UPSTREAM_SHAPE_LEAK");
    }
    for (const tab of ["phishing", "soc"] as const) {
      const settled = await settledFault(requests[tab], "malformed");
      expect(settled).toMatchObject({ outcome: "undecided", reason: "upstream_error", httpStatus: 502 });
    }
  });

  it("parses a badoption fault response into invalid_option", async () => {
    const settled = await settledFault(requests.soc, "badoption");
    expect(settled).toMatchObject({
      outcome: "undecided",
      reason: "invalid_option",
      httpStatus: 502,
      decision: { type: "choice", value: "suspicious" },
    });
    expect(JSON.stringify(settled)).not.toContain("engineering");
  });
});

const requests = {
  phishing: { tab: "phishing", input: { sender: "a@b.co", subject: "Hi", body: "Hello" } },
  soc: {
    tab: "soc",
    input: { alertId: "a", title: "Login", severity: "high", source: "edr", description: "Burst" },
  },
  mcp: mcpInput,
  dlp: { tab: "dlp", input: { prompt: "paste the key" } },
  arena: { tab: "arena", input: { prompt: "hello" } },
} satisfies Record<DecideRequest["tab"], DecideRequest>;

async function settledFault(input: DecideRequest, fault: "malformed" | "badoption") {
  const payload = fault === "malformed" ? malformedPayload() : badOptionPayload();
  const fromCaller = await decide(input, { callDecision: async () => payload });
  const fromFault = await decide(input, {
    fault,
    callDecision: async () => {
      throw new Error("fault must not call upstream");
    },
  });
  expect(fromFault).toEqual(fromCaller);
  return fromFault;
}
