import { describe, expect, it } from "vitest";
import { CONFIDENCE_THRESHOLD, DLP_LEVELS } from "@/lib/contract";
import { applyPolicy, failureDecision } from "@/lib/policy";
import { lowConfidencePayload, parseModelJudgment } from "@/lib/questions";

const levelProbabilities = { "0": 0.1, "1": 0.1, "2": 0.1, "3": 0.2, "4": 0.5 };
const legend = Object.fromEntries(DLP_LEVELS.map((level) => [String(level.index), level.label]));

function scorePayload(score: number, confidence: number) {
  return {
    model: "microsoft-decision-1",
    answers: {
      verdict: { type: "score", score, confidence, legend, probabilities: levelProbabilities, note: "ignore" },
    },
  };
}

describe("guardrail policy", () => {
  it("blocks mcp, dlp, and arena on timeout and upstream errors", () => {
    for (const tab of ["mcp", "dlp", "arena"] as const) {
      expect(failureDecision(tab, "timeout")).toMatchObject({
        outcome: "block",
        reason: "timeout",
        confidence: 0,
        httpStatus: 200,
      });
      expect(failureDecision(tab, "upstream_error")).toMatchObject({ outcome: "block", reason: "upstream_error" });
    }
    expect(failureDecision("mcp", "timeout").decision).toEqual({ type: "yesno", value: false });
    expect(failureDecision("arena", "upstream_error").decision).toEqual({ type: "yesno", value: false });
    expect(failureDecision("dlp", "timeout").decision).toMatchObject({ type: "score", value: 4, min: 0, max: 4 });
  });

  it("leaves phishing and soc undecided on failures", () => {
    for (const tab of ["phishing", "soc"] as const) {
      expect(failureDecision(tab, "timeout").outcome).toBe("undecided");
      expect(failureDecision(tab, "upstream_error").reason).toBe("upstream_error");
      const low = applyPolicy(tab, parseModelJudgment(tab, lowConfidencePayload(tab)));
      expect(low).toMatchObject({ outcome: "undecided", reason: "low_confidence" });
    }
    expect(failureDecision("phishing", "timeout").decision).toEqual({ type: "yesno", value: false });
  });

  it("blocks a confident unsafe answer and a P(yes) near 0.6 as low confidence", () => {
    const unsafe = applyPolicy(
      "mcp",
      parseModelJudgment("mcp", { answers: { verdict: { type: "noul", noul: 0.2 } } }),
    );
    expect(unsafe).toMatchObject({
      outcome: "block",
      reason: "policy_unsafe",
      confidence: 0.8,
      decision: { type: "yesno", value: false },
    });

    for (const tab of ["mcp", "arena", "dlp"] as const) {
      const low = applyPolicy(tab, parseModelJudgment(tab, lowConfidencePayload(tab)));
      expect(low.reason).toBe("low_confidence");
      expect(low.outcome).toBe("block");
      expect(low.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
    }
    for (const tab of ["phishing", "soc"] as const) {
      const low = applyPolicy(tab, parseModelJudgment(tab, lowConfidencePayload(tab)));
      expect(low).toMatchObject({ outcome: "undecided", reason: "low_confidence" });
    }
  });

  it("allows DLP 1.99 and blocks 2.0, including the fractional score 2.97", () => {
    const below = applyPolicy("dlp", parseModelJudgment("dlp", scorePayload(1.99, 0.91)));
    const atCutoff = applyPolicy("dlp", parseModelJudgment("dlp", scorePayload(2, 0.91)));
    const fractional = applyPolicy("dlp", parseModelJudgment("dlp", scorePayload(2.97, 0.9)));
    expect(below).toMatchObject({ outcome: "allow", reason: "ok" });
    expect(below.decision).toMatchObject({ type: "score", value: 1.99, min: 0, max: 4 });
    expect(atCutoff).toMatchObject({ outcome: "block", reason: "score_threshold" });
    expect(fractional).toMatchObject({ outcome: "block", reason: "score_threshold" });
    expect(fractional.decision).toMatchObject({ value: 2.97, probabilities: levelProbabilities });
    expect(JSON.stringify(fractional)).not.toContain("microsoft-decision-1");
    expect(JSON.stringify(fractional)).not.toContain("ignore");
  });

  it("allows a confident yes and blocks confidence below 0.7", () => {
    const atThreshold = applyPolicy(
      "arena",
      parseModelJudgment("arena", { answers: { verdict: { type: "noul", noul: 0.91, confidence: 0.7 } } }),
    );
    const below = applyPolicy(
      "arena",
      parseModelJudgment("arena", { answers: { verdict: { type: "noul", noul: 0.91, confidence: 0.699 } } }),
    );
    expect(atThreshold).toMatchObject({ outcome: "allow", reason: "ok", confidence: 0.7 });
    expect(below).toMatchObject({ outcome: "block", reason: "low_confidence", confidence: 0.699 });
  });
});
