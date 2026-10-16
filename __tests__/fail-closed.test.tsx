import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { OutcomeView } from "@/components/OutcomeView";
import {
  apiErrorSchema,
  decideResponseSchema,
  type DecideResponse,
  type DecisionReason,
  type Outcome,
  type Tab,
} from "@/lib/contract";
import { interpretDecide, logDraftKeys, outcomeHeadline, toLogDraft } from "@/lib/interpret";
import { mockDecideSync } from "@/lib/mock-api";
import type { TransportResult } from "@/lib/transport";

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

function yesNo(options: {
  tab?: Tab;
  value: boolean;
  confidence: number;
  outcome: Outcome;
  reason: DecisionReason;
}): DecideResponse {
  return decideResponseSchema.parse({
    decision: { type: "yesno", value: options.value },
    confidence: options.confidence,
    rationale: "Synthetic.",
    outcome: options.outcome,
    reason: options.reason,
    latencyMs: 50,
    modelMs: 20,
    modelStatus: "ok",
    requestId: REQUEST_ID,
  });
}

function show(tab: Tab, result: TransportResult<DecideResponse>, remainingMs = 0) {
  const model = interpretDecide(tab, result);
  render(<OutcomeView model={model} tab={tab} remainingMs={remainingMs} />);
  return model;
}

const phishingRequest = {
  tab: "phishing" as const,
  input: {
    sender: "payroll-desk@benefits-update.example",
    subject: "Action required: verify payroll before Friday",
    body: "Synthetic payroll password lure.",
  },
};

describe("decision status presentation", () => {
  test("renders a 502 decision body as a card with the reason label", () => {
    for (const scenario of ["timeout", "upstream", "invalid_option"] as const) {
      const result = mockDecideSync({ tab: "mcp", input: { toolName: "search_docs", args: {}, agentContext: "Synthetic." } }, scenario);
      expect(result.ok).toBe(false);
      if (result.ok || result.fault.kind !== "http") throw new Error("expected http fault");
      expect(result.fault.status).toBe(502);
      const body = decideResponseSchema.parse(result.fault.body);
      expect(apiErrorSchema.safeParse(result.fault.body).success).toBe(false);
      const { unmount } = render(
        <OutcomeView model={interpretDecide("mcp", result)} tab="mcp" remainingMs={0} />,
      );
      expect(screen.getByTestId("policy-status").textContent).toBe("Blocked");
      expect(screen.getByTestId("decision-card")).toBeTruthy();
      expect(screen.getByTestId("policy-reason").textContent).toContain(
        scenario === "timeout" ? "Timed out" : scenario === "upstream" ? "Upstream error" : "Invalid option",
      );
      expect(body.reason).toBe(
        scenario === "upstream" ? "upstream_error" : scenario,
      );
      unmount();
    }
  });

  test("leaves phishing and SOC undecided when a 502 decision is a failure", () => {
    const result = mockDecideSync(phishingRequest, "timeout");
    show("phishing", result);
    expect(screen.getByTestId("policy-status").textContent).toBe("Undecided");
    expect(screen.getByTestId("decision-card")).toBeTruthy();
    expect(screen.queryByText("Allowed")).toBeNull();
    expect(screen.queryByText("Blocked")).toBeNull();
  });

  test("falls back to a generic error when a 502 body is only an error envelope", () => {
    const result = mockDecideSync(phishingRequest, "plain_error");
    expect(result.ok).toBe(false);
    if (result.ok || result.fault.kind !== "http") throw new Error("expected http fault");
    expect(result.fault.status).toBe(502);
    expect(decideResponseSchema.safeParse(result.fault.body).success).toBe(false);
    expect(apiErrorSchema.parse(result.fault.body).error.code).toBe("upstream");
    show("dlp", result);
    expect(screen.getByTestId("friendly-error").textContent).toContain("Upstream error");
    expect(screen.queryByTestId("decision-card")).toBeNull();
    expect(screen.queryByTestId("policy-status")).toBeNull();
  });

  test("treats a bare 400 as bad input", () => {
    const result = mockDecideSync(phishingRequest, "bad_request");
    expect(result.ok).toBe(false);
    if (result.ok || result.fault.kind !== "http") throw new Error("expected http fault");
    expect(result.fault.status).toBe(400);
    expect(decideResponseSchema.safeParse(result.fault.body).success).toBe(false);
    show("mcp", result);
    expect(screen.getByRole("alert").textContent).toContain("failed server-side validation");
    expect(screen.queryByTestId("decision-card")).toBeNull();
    expect(screen.queryByTestId("policy-status")).toBeNull();
  });

  test("treats a 401 as a missing session rather than a decision", () => {
    const result = mockDecideSync(phishingRequest, "unauthorized");
    expect(result.ok).toBe(false);
    if (result.ok || result.fault.kind !== "http") throw new Error("expected http fault");
    expect(result.fault.status).toBe(401);
    const body = apiErrorSchema.parse(result.fault.body);
    expect(body.error.code).toBe("unauthorized");
    expect(body.retryAfterMs).toBeUndefined();
    const model = interpretDecide("soc", result);
    expect(model.kind).toBe("auth");
  });

  test("starts a cooldown from retryAfterMs on 429", () => {
    const result = mockDecideSync(phishingRequest, "rate_limited");
    expect(result.ok).toBe(false);
    if (result.ok || result.fault.kind !== "http") throw new Error("expected http fault");
    expect(result.fault.status).toBe(429);
    const body = apiErrorSchema.parse(result.fault.body);
    expect(body.retryAfterMs).toBe(12_000);
    const model = show("soc", result, body.retryAfterMs ?? 0);
    expect(model.kind).toBe("cooldown");
    expect(screen.getByTestId("cooldown").textContent).toContain("Try again in 12s.");
    expect(screen.queryByTestId("decision-card")).toBeNull();
  });

  test("shows Blocked for an unsafe guardrail answer at confidence 0.8", () => {
    const model = show("mcp", {
      ok: true,
      data: yesNo({ value: false, confidence: 0.8, outcome: "block", reason: "policy_unsafe" }),
    });
    expect(screen.getByTestId("policy-status").textContent).toBe("Blocked");
    expect(screen.getByTestId("policy-reason").textContent).toContain("Policy: judged unsafe");
    expect(model.kind === "verdict" && model.reason).toBe("policy_unsafe");
  });

  test("shows Blocked or Undecided from the server outcome at confidence 0.6", () => {
    show("mcp", {
      ok: true,
      data: yesNo({ value: false, confidence: 0.6, outcome: "block", reason: "low_confidence" }),
    });
    expect(screen.getByTestId("policy-status").textContent).toBe("Blocked");
    expect(screen.getByTestId("policy-reason").textContent).toContain("Low confidence");

    const phishing = interpretDecide("phishing", {
      ok: true,
      data: yesNo({
        value: true,
        confidence: 0.6,
        outcome: "undecided",
        reason: "low_confidence",
      }),
    });
    expect(phishing.kind === "verdict" && phishing.headline).toBe("Undecided");
    expect(outcomeHeadline("phishing", yesNo({
      value: true,
      confidence: 0.8,
      outcome: "allow",
      reason: "ok",
    }))).toBe("Phishing");
  });

  test("shows the verdict on phishing and SOC, and Allowed or Blocked on guardrails", () => {
    show("phishing", {
      ok: true,
      data: yesNo({ value: true, confidence: 0.91, outcome: "allow", reason: "ok" }),
    });
    expect(screen.getByTestId("policy-status").textContent).toBe("Phishing");
    expect(screen.queryByText("Allowed")).toBeNull();

    const legitimate = interpretDecide("phishing", {
      ok: true,
      data: yesNo({ value: false, confidence: 0.91, outcome: "allow", reason: "ok" }),
    });
    expect(legitimate.kind === "verdict" && legitimate.headline).toBe("Legitimate");

    const soc = interpretDecide("soc", {
      ok: true,
      data: decideResponseSchema.parse({
        decision: {
          type: "choice",
          value: "malicious",
          options: [{ label: "benign" }, { label: "suspicious" }, { label: "malicious" }],
          probabilities: { benign: 0.05, suspicious: 0.15, malicious: 0.8 },
        },
        confidence: 0.9,
        outcome: "allow",
        reason: "ok",
        latencyMs: 20,
        modelMs: 10,
        modelStatus: "ok",
        requestId: REQUEST_ID,
      }),
    });
    expect(soc.kind === "verdict" && soc.headline).toBe("Malicious");

    const undecided = interpretDecide("soc", {
      ok: true,
      data: decideResponseSchema.parse({
        decision: {
          type: "choice",
          value: "suspicious",
          options: [{ label: "suspicious" }],
          probabilities: { suspicious: 0.6 },
        },
        confidence: 0.6,
        outcome: "undecided",
        reason: "low_confidence",
        latencyMs: 20,
        modelMs: 10,
        modelStatus: "ok",
        requestId: REQUEST_ID,
      }),
    });
    expect(undecided.kind === "verdict" && undecided.headline).toBe("Undecided");

    const allowed = interpretDecide("arena", {
      ok: true,
      data: yesNo({ value: true, confidence: 0.91, outcome: "allow", reason: "ok" }),
    });
    expect(allowed.kind === "verdict" && allowed.headline).toBe("Allowed");
  });

  test("does not invent a blocked outcome for a client timeout with no body", () => {
    show("mcp", { ok: false, fault: { kind: "timeout" } });
    expect(screen.getByTestId("friendly-error").textContent).toContain("No decision returned");
    expect(screen.queryByTestId("decision-card")).toBeNull();
    expect(screen.queryByTestId("policy-status")).toBeNull();
  });

  test("request log drafts keep only decision fields", () => {
    const model = interpretDecide("phishing", {
      ok: true,
      data: yesNo({ value: true, confidence: 0.91, outcome: "allow", reason: "ok" }),
    });
    const draft = toLogDraft("phishing", model);
    expect(Object.keys(draft).sort()).toEqual(
      ["confidence", "decision", "latencyMs", "requestId", "tab"].sort(),
    );
    expect(logDraftKeys(draft)).toEqual(Object.keys(draft));
    expect(draft.decision).toBe("Phishing (ok)");
    expect(JSON.stringify(draft)).not.toContain("passcode");
    expect(JSON.stringify(draft)).not.toContain("Bearer");
  });
});
