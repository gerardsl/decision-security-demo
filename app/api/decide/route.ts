import "server-only";
import { decideResponseSchema, decideRequestSchema, type DecideResponse } from "@/lib/contract";
import { assertSession } from "@/lib/auth";
import { decide } from "@/lib/decide";
import { readDemoFault } from "@/lib/faults";
import { ApiError, jsonError, readJsonBody } from "@/lib/http";
import { logDecision } from "@/lib/log";
import { modelServerTiming } from "@/lib/model-timing";
import { enforceRateLimit } from "@/lib/ratelimit";

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  let tab: string | undefined;
  try {
    await enforceRateLimit(request, "api");
    assertSession(request);
    const parsed = decideRequestSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new ApiError("bad_request", "Request body is invalid.");
    tab = parsed.data.tab;
    const settled = await decide(parsed.data, { fault: readDemoFault(request) });
    const response: DecideResponse = {
      decision: settled.decision,
      confidence: settled.confidence,
      outcome: settled.outcome,
      reason: settled.reason,
      latencyMs: Date.now() - started,
      modelMs: settled.modelMs,
      modelStatus: settled.modelStatus,
      requestId,
    };
    const checked = decideResponseSchema.safeParse(response);
    if (!checked.success) throw new ApiError("upstream", "Upstream decision failed.");
    logDecision({
      requestId,
      tab,
      latencyMs: checked.data.latencyMs,
      outcome: checked.data.outcome,
      reason: checked.data.reason,
      decision: checked.data.decision.type,
    });
    return Response.json(checked.data, {
      status: settled.httpStatus,
      headers: { "Server-Timing": modelServerTiming(checked.data.modelMs) },
    });
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError("upstream", "Upstream decision failed.");
    logDecision({
      requestId,
      tab,
      latencyMs: Date.now() - started,
    });
    return jsonError(requestId, apiError);
  }
}
