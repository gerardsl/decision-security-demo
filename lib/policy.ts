import {
  CONFIDENCE_THRESHOLD,
  DLP_BLOCK_SCORE,
  DLP_SCORE_RANGE,
  SOC_OPTIONS,
  tabPolicy,
  type Decision,
  type DecisionReason,
  type Outcome,
  type Tab,
} from "@/lib/contract";
import type { ModelJudgment } from "@/lib/questions";

export type SettledDecision = {
  decision: Decision;
  confidence: number;
  outcome: Outcome;
  reason: DecisionReason;
  httpStatus: 200 | 502;
};

export function failureDecision(tab: Tab, reason: DecisionReason): SettledDecision {
  const closed = tabPolicy[tab].failMode === "closed";
  return {
    decision: safeDecision(tab),
    confidence: 0,
    outcome: closed ? "block" : "undecided",
    reason,
    httpStatus: reason === "invalid_option" ? 502 : 200,
  };
}

export function applyPolicy(tab: Tab, judgment: ModelJudgment): SettledDecision {
  if (judgment.confidence < CONFIDENCE_THRESHOLD) {
    return {
      decision: judgment.decision,
      confidence: judgment.confidence,
      outcome: tabPolicy[tab].failMode === "closed" ? "block" : "undecided",
      reason: "low_confidence",
      httpStatus: 200,
    };
  }
  if (tabPolicy[tab].failMode === "closed" && !isAllowAnswer(tab, judgment.decision)) {
    return {
      decision: judgment.decision,
      confidence: judgment.confidence,
      outcome: "block",
      reason: tab === "dlp" ? "score_threshold" : "policy_unsafe",
      httpStatus: 200,
    };
  }
  return {
    decision: judgment.decision,
    confidence: judgment.confidence,
    outcome: "allow",
    reason: "ok",
    httpStatus: 200,
  };
}

function isAllowAnswer(tab: Tab, decision: Decision): boolean {
  if (tab === "dlp") return decision.type === "score" && decision.value < DLP_BLOCK_SCORE;
  if (decision.type === "yesno") return decision.value;
  return false;
}

function safeDecision(tab: Tab): Decision {
  switch (tabPolicy[tab].decisionType) {
    case "yesno":
      return { type: "yesno", value: false };
    case "choice":
      return {
        type: "choice",
        value: "suspicious",
        options: SOC_OPTIONS.map((option) => ({ label: option.label })),
        probabilities: {},
      };
    case "score":
      return {
        type: "score",
        value: DLP_SCORE_RANGE.max,
        min: DLP_SCORE_RANGE.min,
        max: DLP_SCORE_RANGE.max,
        probabilities: {},
      };
  }
}
