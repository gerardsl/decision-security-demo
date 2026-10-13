import type { DecideResponse } from "@/lib/contract";
import { createSessionValue, SESSION_COOKIE } from "@/lib/session";

export const SESSION_SECRET = "test-session-secret-0123456789";
export const DEMO_PASSCODE = "correct-passcode";
export const AZURE_CLIENT_SECRET = "azure-client-secret-value";
export const ATTACKER_API_KEY = "attacker-api-key-value";

export function sessionCookie(secret = SESSION_SECRET): string {
  return `${SESSION_COOKIE}=${createSessionValue(secret)}`;
}

export function authHeaders(ip = "203.0.113.50", extra?: Record<string, string>): Headers {
  return new Headers({
    "content-type": "application/json",
    cookie: sessionCookie(),
    "x-forwarded-for": ip,
    ...extra,
  });
}

export function postJson(url: string, body: unknown, headers = authHeaders()): Request {
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export function verdict(overrides: Partial<DecideResponse> = {}): DecideResponse {
  return {
    decision: { type: "yesno", value: true },
    confidence: 0.91,
    status: "decided",
    latencyMs: 12,
    requestId: crypto.randomUUID(),
    ...overrides,
  };
}
