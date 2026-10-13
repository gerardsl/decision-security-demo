import "server-only";
import { decideResponseSchema, decideRequestSchema, type DecideResponse } from "@/lib/contract";
import { assertSession } from "@/lib/auth";
import { decide } from "@/lib/decide";
import { readDemoFault } from "@/lib/faults";
import { ApiError, jsonError, readJsonBody } from "@/lib/http";
import { logDecision } from "@/lib/log";
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
      status: settled.status,
      latencyMs: Date.now() - started,
      requestId,
      ...(settled.reason ? { reason: settled.reason } : {}),
    };
    const checked = decideResponseSchema.safeParse(response);
    if (!checked.success) throw new ApiError("upstream", "Upstream decision failed.");
    logDecision({
      requestId,
      tab,
      latencyMs: checked.data.latencyMs,
      decision: checked.data.decision.type,
      status: checked.data.status,
    });
    return Response.json(checked.data);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError("upstream", "Upstream decision failed.");
    logDecision({
      requestId,
      tab,
      latencyMs: Date.now() - started,
      status: apiError.code,
    });
    return jsonError(requestId, apiError);
  }
}
