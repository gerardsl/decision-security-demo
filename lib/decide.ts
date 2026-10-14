import "server-only";
import type { DecideRequest } from "@/lib/contract";
import type { DemoFault } from "@/lib/faults";
import { ApiError } from "@/lib/http";
import { applyPolicy, failureDecision, type SettledDecision } from "@/lib/policy";
import {
  buildSystemOneRequest,
  InvalidOptionError,
  badLegendPayload,
  badOptionPayload,
  lowConfidencePayload,
  malformedPayload,
  parseModelJudgment,
} from "@/lib/questions";
import { createDecisionCaller, DecisionCallError } from "@/lib/upstream";

export type DecisionCaller = (body: unknown) => Promise<unknown>;

export type DecideOptions = {
  fault?: DemoFault | null;
  callDecision?: DecisionCaller;
};

let defaultCaller: DecisionCaller | undefined;

const MCP_TOOL_NAME = /^[A-Za-z0-9_.:-]{1,64}$/;

export async function decide(input: DecideRequest, options: DecideOptions = {}): Promise<SettledDecision> {
  if (input.tab === "mcp" && !MCP_TOOL_NAME.test(input.input.toolName)) {
    return failureDecision(input.tab, "invalid_tool_name");
  }
  try {
    const raw = await loadUpstream(input, options);
    return applyPolicy(input.tab, parseModelJudgment(input.tab, raw));
  } catch (error) {
    if (error instanceof DecisionCallError) {
      return failureDecision(input.tab, error.reason === "timeout" ? "timeout" : "upstream_error");
    }
    if (error instanceof InvalidOptionError) return failureDecision(input.tab, "invalid_option");
    if (error instanceof ApiError) throw error;
    return failureDecision(input.tab, "upstream_error");
  }
}

async function loadUpstream(input: DecideRequest, options: DecideOptions): Promise<unknown> {
  if (options.fault === "timeout") throw new DecisionCallError("timeout");
  if (options.fault === "upstream") throw new DecisionCallError("upstream");
  if (options.fault === "lowconf") return lowConfidencePayload(input.tab);
  if (options.fault === "malformed") return malformedPayload();
  if (options.fault === "badoption") return badOptionPayload();
  if (options.fault === "badlegend") return badLegendPayload();
  const request = buildSystemOneRequest(input);
  return caller(options)(request);
}

function caller(options: DecideOptions): DecisionCaller {
  if (options.callDecision) return options.callDecision;
  defaultCaller ??= createDecisionCaller();
  return defaultCaller;
}
