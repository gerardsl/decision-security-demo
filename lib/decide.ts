import "server-only";
import type { DecideRequest } from "@/lib/contract";
import type { DemoFault } from "@/lib/faults";
import { ApiError } from "@/lib/http";
import { NO_MODEL_TIMING, integerMs, readTimedModelBody, type ModelTiming } from "@/lib/model-timing";
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
    return finish(failureDecision(input.tab, "invalid_tool_name"), NO_MODEL_TIMING);
  }
  let observed: ModelTiming = NO_MODEL_TIMING;
  try {
    const raw = await loadUpstream(input, options);
    const timed = readTimedModelBody(raw);
    observed = timed?.timing ?? NO_MODEL_TIMING;
    return finish(applyPolicy(input.tab, parseModelJudgment(input.tab, timed ? timed.body : raw)), observed);
  } catch (error) {
    if (error instanceof DecisionCallError) {
      const timing =
        observed.modelStatus === null
          ? {
              modelMs: integerMs(error.modelMs),
              modelStatus: error.reason === "timeout" ? ("timeout" as const) : ("error" as const),
            }
          : observed;
      return finish(
        failureDecision(input.tab, error.reason === "timeout" ? "timeout" : "upstream_error"),
        timing,
      );
    }
    if (error instanceof InvalidOptionError) return finish(failureDecision(input.tab, "invalid_option"), observed);
    if (error instanceof ApiError) throw error;
    return finish(
      failureDecision(input.tab, "upstream_error"),
      observed.modelStatus === null ? { modelMs: observed.modelMs, modelStatus: "error" } : observed,
    );
  }
}

function finish(settled: SettledDecision, timing: ModelTiming): SettledDecision {
  return { ...settled, modelMs: timing.modelMs, modelStatus: timing.modelStatus };
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
