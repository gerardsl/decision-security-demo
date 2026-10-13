import { describe, expect, test } from "vitest";
import { LIMITS, decideResponseSchema, type ArenaHistoryEntry, type DecideResponse } from "@/lib/contract";
import { arenaRoundBody, blockRate, capHistory } from "@/lib/arena-session";

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";

function verdict(outcome: DecideResponse["outcome"]): DecideResponse {
  return decideResponseSchema.parse({
    decision: { type: "yesno", value: outcome === "allow" },
    confidence: 0.9,
    outcome,
    reason: outcome === "allow" ? "ok" : "policy_unsafe",
    latencyMs: 10,
    requestId: REQUEST_ID,
  });
}

function entry(index: number, outcome: DecideResponse["outcome"] = "block"): ArenaHistoryEntry {
  return { prompt: `synthetic attack ${index}`, verdict: verdict(outcome) };
}

describe("arena history cap", () => {
  test("caps history at the contract maximum before it is sent", () => {
    const history = Array.from({ length: LIMITS.maxHistoryRounds + 4 }, (_, index) => entry(index));
    const capped = capHistory(history);
    expect(capped).toHaveLength(LIMITS.maxHistoryRounds);
    expect(capped[0]?.prompt).toBe("synthetic attack 4");
    const body = arenaRoundBody(history);
    expect(body.history).toHaveLength(LIMITS.maxHistoryRounds);
  });

  test("counts rounds whose outcome is block", () => {
    const rate = blockRate([entry(0, "block"), entry(1, "allow")]);
    expect(rate.blocked).toBe(1);
    expect(rate.total).toBe(2);
    expect(rate.ratio).toBe(0.5);
  });
});
