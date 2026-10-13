import "server-only";
import { NextResponse } from "next/server";
import { passcodeSuccessSchema, passcodeRequestSchema } from "@/lib/contract";
import { checkPasscode, issueSessionCookie, sessionSecret } from "@/lib/auth";
import { ApiError, jsonError, readJsonBody } from "@/lib/http";
import { logDecision } from "@/lib/log";
import { enforceRateLimit } from "@/lib/ratelimit";

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  try {
    await enforceRateLimit(request, "passcode");
    const parsed = passcodeRequestSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new ApiError("bad_request", "Request body is invalid.");
    checkPasscode(parsed.data.passcode);
    const secret = sessionSecret();
    if (!secret) throw new ApiError("unauthorized", "Authentication required.");
    const cookie = issueSessionCookie(secret);
    const body = passcodeSuccessSchema.parse({ ok: true, requestId });
    const response = NextResponse.json(body);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    logDecision({ requestId, latencyMs: Date.now() - started, status: "authenticated" });
    return response;
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError("upstream", "Upstream decision failed.");
    logDecision({
      requestId,
      latencyMs: Date.now() - started,
      status: apiError.code,
    });
    return jsonError(requestId, apiError);
  }
}
