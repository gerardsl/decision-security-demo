import {
  CONFIDENCE_THRESHOLD,
  DLP_SCORE_RANGE,
  SOC_OPTIONS,
  tabPolicy,
  type Decision,
  type DecisionReason,
  type Tab,
} from "@/lib/contract";
import type { ModelJudgment } from "@/lib/questions";

export type SettledDecision = {
  decision: Decision;
  confidence: number;
  status: "decided" | "blocked" | "undecided";
  reason?: DecisionReason;
};

export function failureDecision(tab: Tab, reason: DecisionReason): SettledDecision {
  const closed = tabPolicy[tab].failMode === "closed";
  return {
    decision: safeDecision(tab),
    confidence: 0,
    status: closed ? "blocked" : "undecided",
    reason,
  };
}

export function applyConfidence(tab: Tab, judgment: ModelJudgment): SettledDecision {
  if (judgment.confidence < CONFIDENCE_THRESHOLD) {
    const closed = tabPolicy[tab].failMode === "closed";
    return {
      decision: judgment.decision,
      confidence: judgment.confidence,
      status: closed ? "blocked" : "undecided",
      reason: "lowconf",
    };
  }
  return {
    decision: judgment.decision,
    confidence: judgment.confidence,
    status: "decided",
  };
}

function safeDecision(tab: Tab): Decision {
  switch (tabPolicy[tab].decisionType) {
    case "yesno":
      return { type: "yesno", value: tabPolicy[tab].failMode === "closed" };
    case "choice":
      return {
        type: "choice",
        value: "suspicious",
        options: SOC_OPTIONS.map((option) => ({ label: option.label })),
      };
    case "score":
      return {
        type: "score",
        value: DLP_SCORE_RANGE.max,
        min: DLP_SCORE_RANGE.min,
        max: DLP_SCORE_RANGE.max,
      };
  }
}
