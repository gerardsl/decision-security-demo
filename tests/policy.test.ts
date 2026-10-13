import { describe, expect, it } from "vitest";
import { CONFIDENCE_THRESHOLD } from "@/lib/contract";
import { applyConfidence, failureDecision } from "@/lib/policy";
import { lowConfidencePayload, parseModelJudgment } from "@/lib/questions";

describe("fail-closed policy", () => {
  it("blocks mcp, dlp, and arena on timeout, upstream, and low confidence", () => {
    for (const tab of ["mcp", "dlp", "arena"] as const) {
      expect(failureDecision(tab, "timeout")).toMatchObject({ status: "blocked", reason: "timeout", confidence: 0 });
      expect(failureDecision(tab, "upstream")).toMatchObject({ status: "blocked", reason: "upstream" });
      const low = applyConfidence(tab, parseModelJudgment(tab, lowConfidencePayload(tab)));
      expect(low.status).toBe("blocked");
      expect(low.reason).toBe("lowconf");
      expect(low.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
    }
    expect(failureDecision("mcp", "timeout").decision).toEqual({ type: "yesno", value: true });
    expect(failureDecision("arena", "upstream").decision).toEqual({ type: "yesno", value: true });
    expect(failureDecision("dlp", "timeout").decision).toMatchObject({ type: "score", value: 4, min: 0, max: 4 });
  });

  it("leaves phishing and soc undecided", () => {
    for (const tab of ["phishing", "soc"] as const) {
      expect(failureDecision(tab, "timeout").status).toBe("undecided");
      expect(failureDecision(tab, "upstream").reason).toBe("upstream");
      const low = applyConfidence(tab, parseModelJudgment(tab, lowConfidencePayload(tab)));
      expect(low).toMatchObject({ status: "undecided", reason: "lowconf" });
    }
    expect(failureDecision("phishing", "timeout").decision).toEqual({ type: "yesno", value: false });
  });

  it("treats 0.7 as decided and anything lower as low confidence", () => {
    const atThreshold = applyConfidence(
      "mcp",
      parseModelJudgment("mcp", { answers: { verdict: { type: "noul", noul: 0.2, confidence: 0.7 } } }),
    );
    const below = applyConfidence(
      "mcp",
      parseModelJudgment("mcp", { answers: { verdict: { type: "noul", noul: 0.2, confidence: 0.699 } } }),
    );
    expect(atThreshold).toMatchObject({ status: "decided", confidence: 0.7 });
    expect(atThreshold.reason).toBeUndefined();
    expect(below).toMatchObject({ status: "blocked", reason: "lowconf", confidence: 0.699 });
    expect(below.decision).toEqual({ type: "yesno", value: false });
  });
});
