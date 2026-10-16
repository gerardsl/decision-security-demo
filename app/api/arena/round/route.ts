import "server-only";
import { arenaRoundResponseSchema } from "@/lib/contract";
import { playArenaRound } from "@/lib/arena";
import { assertSession } from "@/lib/auth";
import { readDemoFault } from "@/lib/faults";
import { ApiError, jsonError, readJsonBody } from "@/lib/http";
import { logDecision } from "@/lib/log";
import { modelServerTiming } from "@/lib/model-timing";
import { enforceRateLimit } from "@/lib/ratelimit";

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  try {
    await enforceRateLimit(request, "api");
    assertSession(request);
    const played = await playArenaRound(await readJsonBody(request), { fault: readDemoFault(request) });
    const response = {
      attack: played.attack,
      round: played.round,
      verdict: {
        decision: played.verdict.decision,
        confidence: played.verdict.confidence,
        outcome: played.verdict.outcome,
        reason: played.verdict.reason,
        latencyMs: Date.now() - started,
        modelMs: played.verdict.modelMs,
        modelStatus: played.verdict.modelStatus,
        requestId,
      },
    };
    const checked = arenaRoundResponseSchema.safeParse(response);
    if (!checked.success) throw new ApiError("upstream", "Upstream decision failed.");
    logDecision({
      requestId,
      tab: "arena",
      latencyMs: checked.data.verdict.latencyMs,
      outcome: checked.data.verdict.outcome,
      reason: checked.data.verdict.reason,
      decision: checked.data.verdict.decision.type,
    });
    return Response.json(checked.data, {
      status: played.verdict.httpStatus,
      headers: { "Server-Timing": modelServerTiming(checked.data.verdict.modelMs) },
    });
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError("upstream", "Upstream decision failed.");
    logDecision({
      requestId,
      tab: "arena",
      latencyMs: Date.now() - started,
    });
    return jsonError(requestId, apiError);
  }
}
