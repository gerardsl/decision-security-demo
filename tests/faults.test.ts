import { describe, expect, it, vi } from "vitest";
import { decide } from "@/lib/decide";
import { readDemoFault } from "@/lib/faults";
import { DecisionCallError } from "@/lib/upstream";
import { lowConfidencePayload } from "@/lib/questions";
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
    expect(faulted).toMatchObject({ status: "blocked", reason: "timeout" });

    const upstreamThrown = await decide(mcpInput, {
      callDecision: async () => {
        throw new DecisionCallError("upstream");
      },
    });
    const upstreamFault = await decide(mcpInput, { fault: "upstream" });
    expect(upstreamFault).toEqual(upstreamThrown);

    const payloadCaller = vi.fn(async () => lowConfidencePayload("mcp"));
    const fromPayload = await decide(mcpInput, { callDecision: payloadCaller });
    const fromFault = await decide(mcpInput, {
      fault: "lowconf",
      callDecision: async () => {
        throw new Error("fault must not call upstream");
      },
    });
    expect(fromFault).toEqual(fromPayload);
    expect(fromFault).toMatchObject({ status: "blocked", reason: "lowconf" });
    expect(payloadCaller).toHaveBeenCalledOnce();
  });
});
