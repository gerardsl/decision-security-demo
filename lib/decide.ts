import "server-only";
import type { DecideRequest } from "@/lib/contract";
import type { DemoFault } from "@/lib/faults";
import { ApiError } from "@/lib/http";
import { applyConfidence, failureDecision, type SettledDecision } from "@/lib/policy";
import { buildSystemOneRequest, lowConfidencePayload, parseModelJudgment } from "@/lib/questions";
import { createDecisionCaller, DecisionCallError } from "@/lib/upstream";

export type DecisionCaller = (body: unknown) => Promise<unknown>;

export type DecideOptions = {
  fault?: DemoFault | null;
  callDecision?: DecisionCaller;
};

let defaultCaller: DecisionCaller | undefined;

export async function decide(input: DecideRequest, options: DecideOptions = {}): Promise<SettledDecision> {
  try {
    const raw = await loadUpstream(input, options);
    return applyConfidence(input.tab, parseModelJudgment(input.tab, raw));
  } catch (error) {
    if (error instanceof DecisionCallError) return failureDecision(input.tab, error.reason);
    if (error instanceof ApiError) throw error;
    return failureDecision(input.tab, "upstream");
  }
}

async function loadUpstream(input: DecideRequest, options: DecideOptions): Promise<unknown> {
  if (options.fault === "timeout") throw new DecisionCallError("timeout");
  if (options.fault === "upstream") throw new DecisionCallError("upstream");
  if (options.fault === "lowconf") return lowConfidencePayload(input.tab);
  const request = buildSystemOneRequest(input);
  return caller(options)(request);
}

function caller(options: DecideOptions): DecisionCaller {
  if (options.callDecision) return options.callDecision;
  defaultCaller ??= createDecisionCaller();
  return defaultCaller;
}
