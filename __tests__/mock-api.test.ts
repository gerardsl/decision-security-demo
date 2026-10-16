import { describe, expect, test } from "vitest";
import {
  DLP_BLOCK_SCORE,
  FAIL_CLOSED_TABS,
  TABS,
  apiErrorSchema,
  decideResponseSchema,
  type DecideRequest,
  type Tab,
} from "@/lib/contract";
import {
  arenaPresets,
  dlpPresets,
  mcpPresets,
  phishingPresets,
  socPresets,
} from "@/lib/presets";
import {
  buildArenaRequest,
  buildDlpRequest,
  buildMcpRequest,
  buildPhishingRequest,
  buildSocRequest,
} from "@/lib/forms";
import { MOCK_SCENARIOS, mockDecideSync, mockPasscodeSync } from "@/lib/mock-api";

function presetRequests(
  tab: Tab,
  presets: readonly { values: Record<string, string> }[],
  build: (values: Record<string, string>) => { success: boolean; input?: DecideRequest },
): DecideRequest[] {
  return presets.map((preset) => {
    const parsed = build(preset.values);
    if (!parsed.success || !parsed.input) throw new Error(`preset for ${tab}`);
    return parsed.input;
  });
}

function requestsFor(tab: Tab): DecideRequest[] {
  if (tab === "phishing") return presetRequests(tab, phishingPresets, buildPhishingRequest);
  if (tab === "soc") return presetRequests(tab, socPresets, buildSocRequest);
  if (tab === "mcp") return presetRequests(tab, mcpPresets, buildMcpRequest);
  if (tab === "dlp") return presetRequests(tab, dlpPresets, buildDlpRequest);
  return presetRequests(tab, arenaPresets, buildArenaRequest);
}

describe("mock API", () => {
  test("every nominal and low-confidence fixture parses and follows the server outcome", () => {
    for (const tab of TABS) {
      for (const request of requestsFor(tab)) {
        for (const scenario of ["nominal", "lowconf"] as const) {
          const result = mockDecideSync(request, scenario);
          expect(result.ok).toBe(true);
          if (!result.ok) continue;
          const body = decideResponseSchema.parse(result.data);
          if (scenario === "lowconf") {
            expect(body.confidence).toBe(0.6);
            expect(body.reason).toBe("low_confidence");
            expect(body.outcome).toBe(
              (FAIL_CLOSED_TABS as readonly string[]).includes(tab) ? "block" : "undecided",
            );
            continue;
          }
          expect(body.confidence).toBeGreaterThanOrEqual(0.7);
          if (tab === "phishing" || tab === "soc") {
            expect(body.outcome).toBe("allow");
            expect(body.reason).toBe("ok");
          } else if (tab === "dlp" && body.decision.type === "score") {
            if (body.decision.value < DLP_BLOCK_SCORE) {
              expect(body.outcome).toBe("allow");
              expect(body.reason).toBe("ok");
            } else {
              expect(body.outcome).toBe("block");
              expect(body.reason).toBe("score_threshold");
            }
          } else if (body.decision.type === "yesno") {
            expect(body.outcome).toBe(body.decision.value ? "allow" : "block");
            expect(body.reason).toBe(body.decision.value ? "ok" : "policy_unsafe");
          }
        }
      }
    }
  });

  test("timeout, upstream_error, and invalid_option are 502 decision bodies", () => {
    const reasons = {
      timeout: "timeout",
      upstream: "upstream_error",
      invalid_option: "invalid_option",
    } as const;
    for (const tab of TABS) {
      const request = requestsFor(tab)[0];
      if (!request) throw new Error(tab);
      for (const scenario of ["timeout", "upstream", "invalid_option"] as const) {
        const result = mockDecideSync(request, scenario);
        expect(result.ok).toBe(false);
        if (result.ok || result.fault.kind !== "http") throw new Error("expected http fault");
        expect(result.fault.status).toBe(502);
        const body = decideResponseSchema.parse(result.fault.body);
        expect(body.reason).toBe(reasons[scenario]);
        expect(body.outcome).toBe(
          (FAIL_CLOSED_TABS as readonly string[]).includes(tab) ? "block" : "undecided",
        );
        expect(apiErrorSchema.safeParse(result.fault.body).success).toBe(false);
      }
    }
  });

  test("400, 401, 429, and a plain 502 stay bare error envelopes", () => {
    const request = requestsFor("phishing")[0];
    if (!request) throw new Error("preset");

    const bad = mockDecideSync(request, "bad_request");
    expect(bad.ok).toBe(false);
    if (!bad.ok && bad.fault.kind === "http") {
      expect(bad.fault.status).toBe(400);
      expect(apiErrorSchema.parse(bad.fault.body).error.code).toBe("bad_request");
      expect(decideResponseSchema.safeParse(bad.fault.body).success).toBe(false);
    }

    const denied = mockDecideSync(request, "unauthorized");
    expect(denied.ok).toBe(false);
    if (!denied.ok && denied.fault.kind === "http") {
      expect(denied.fault.status).toBe(401);
      const body = apiErrorSchema.parse(denied.fault.body);
      expect(body.error.code).toBe("unauthorized");
      expect(body.retryAfterMs).toBeUndefined();
    }

    const limited = mockDecideSync(request, "rate_limited");
    expect(limited.ok).toBe(false);
    if (!limited.ok && limited.fault.kind === "http") {
      expect(limited.fault.status).toBe(429);
      expect(apiErrorSchema.parse(limited.fault.body).retryAfterMs).toBe(12_000);
    }

    const plain = mockDecideSync(request, "plain_error");
    expect(plain.ok).toBe(false);
    if (!plain.ok && plain.fault.kind === "http") {
      expect(plain.fault.status).toBe(502);
      expect(apiErrorSchema.parse(plain.fault.body).error.code).toBe("upstream");
      expect(decideResponseSchema.safeParse(plain.fault.body).success).toBe(false);
    }

    const passcode = mockPasscodeSync("unauthorized");
    expect(passcode.ok).toBe(false);
    if (!passcode.ok && passcode.fault.kind === "http") {
      expect(passcode.fault.status).toBe(401);
    }
  });

  test("reports a simulated model duration at or under total latency", () => {
    const request = requestsFor("phishing")[0];
    if (!request) throw new Error("preset");
    const statuses = {
      nominal: "ok",
      lowconf: "ok",
      timeout: "timeout",
      upstream: "error",
      invalid_option: "ok",
    } as const;
    for (const scenario of ["nominal", "lowconf", "timeout", "upstream", "invalid_option"] as const) {
      const result = mockDecideSync(request, scenario);
      const raw = result.ok ? result.data : result.fault.kind === "http" ? result.fault.body : null;
      const body = decideResponseSchema.parse(raw);
      expect(body.modelMs).toEqual(expect.any(Number));
      expect(Number.isInteger(body.modelMs)).toBe(true);
      expect(body.modelMs).toBeLessThanOrEqual(body.latencyMs);
      expect(body.modelStatus).toBe(statuses[scenario]);
    }
  });

  test("stays valid when model timing is null", () => {
    const request = requestsFor("soc")[0];
    if (!request) throw new Error("preset");
    const result = mockDecideSync(request, "nominal");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.modelMs).not.toBeNull();
    const cleared = decideResponseSchema.safeParse({
      ...result.data,
      modelMs: null,
      modelStatus: null,
    });
    expect(cleared.success).toBe(true);
    if (!cleared.success) return;
    expect(cleared.data.modelMs).toBeNull();
    expect(cleared.data.modelStatus).toBeNull();
  });

  test("lists a mock scenario for every status case", () => {
    expect(MOCK_SCENARIOS).toEqual(
      expect.arrayContaining([
        "timeout",
        "upstream",
        "invalid_option",
        "bad_request",
        "unauthorized",
        "rate_limited",
        "plain_error",
      ]),
    );
  });
});
