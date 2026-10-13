import "server-only";
import { arenaRoundResponseSchema } from "@/lib/contract";
import { playArenaRound } from "@/lib/arena";
import { assertSession } from "@/lib/auth";
import { readDemoFault } from "@/lib/faults";
import { ApiError, jsonError, readJsonBody } from "@/lib/http";
import { logDecision } from "@/lib/log";
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
        requestId,
      },
    };
    const checked = arenaRoundResponseSchema.safeParse(response);
    if (!checked.success) throw new ApiError("upstream", "Upstream decision failed.");
    logDecision({
      requestId,
      tab: "arena",
      latencyMs: checked.data.verdict.latencyMs,
      decision: checked.data.verdict.decision.type,
      status: checked.data.verdict.outcome,
    });
    return Response.json(checked.data, { status: played.verdict.httpStatus });
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError("upstream", "Upstream decision failed.");
    logDecision({
      requestId,
      tab: "arena",
      latencyMs: Date.now() - started,
      status: apiError.code,
    });
    return jsonError(requestId, apiError);
  }
}
