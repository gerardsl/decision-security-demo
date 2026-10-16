import {
  LIMITS,
  arenaRoundRequestSchema,
  arenaRoundResponseSchema,
  decideRequestSchema,
  decideResponseSchema,
  passcodeRequestSchema,
  passcodeSuccessSchema,
  type ArenaHistoryEntry,
  type ArenaRoundResponse,
  type DecideRequest,
  type DecideResponse,
  type PasscodeSuccess,
} from "@/lib/contract";
import { ARENA_ROUND_PATH, CLIENT_TIMEOUT_MS, DECIDE_PATH, PASSCODE_PATH } from "@/lib/endpoints";
import { isArenaLive, isMockEnabled } from "@/lib/flags";
import { arenaRoundBody, fixtureForRound } from "@/lib/arena-session";
import { mockArenaRound, mockDecide, mockPasscode, type MockScenario } from "@/lib/mock-api";
import { readModelLatencyMs, stripModelTimingFields } from "@/lib/latency";
import type { TransportResult } from "@/lib/transport";

type Schema<T> = {
  safeParse: (data: unknown) => { success: true; data: T } | { success: false };
};

function invalidResponse<T>(modelMs: number | null = null): TransportResult<T> {
  return { ok: false, fault: { kind: "http", status: 502, body: null }, modelMs };
}

async function postJson<T>(path: string, body: unknown, schema: Schema<T>): Promise<TransportResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json: unknown = null;
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    const modelMs = readModelLatencyMs(json);
    const payload = stripModelTimingFields(json);
    if (!response.ok) {
      return { ok: false, fault: { kind: "http", status: response.status, body: payload }, modelMs };
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) return invalidResponse(modelMs);
    return { ok: true, data: parsed.data, modelMs };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, fault: { kind: "timeout" }, modelMs: null };
    }
    return { ok: false, fault: { kind: "network" }, modelMs: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function submitPasscode(
  passcode: string,
  scenario: MockScenario,
): Promise<TransportResult<PasscodeSuccess>> {
  const parsed = passcodeRequestSchema.safeParse({ passcode });
  if (!parsed.success) {
    return { ok: false, fault: { kind: "http", status: 400, body: null } };
  }
  if (isMockEnabled()) return mockPasscode(scenario);
  return postJson(PASSCODE_PATH, parsed.data, passcodeSuccessSchema);
}

export async function submitDecide(
  request: DecideRequest,
  scenario: MockScenario,
): Promise<TransportResult<DecideResponse>> {
  const parsed = decideRequestSchema.safeParse(request);
  if (!parsed.success) {
    return { ok: false, fault: { kind: "http", status: 400, body: null } };
  }
  if (isMockEnabled()) return mockDecide(parsed.data, scenario);
  return postJson(DECIDE_PATH, parsed.data, decideResponseSchema);
}

export async function submitArenaRound(
  history: readonly ArenaHistoryEntry[],
  scenario: MockScenario,
): Promise<TransportResult<ArenaRoundResponse>> {
  if (isArenaLive()) {
    const body = arenaRoundRequestSchema.safeParse(arenaRoundBody(history));
    if (!body.success) {
      return { ok: false, fault: { kind: "http", status: 400, body: null } };
    }
    if (isMockEnabled()) return mockArenaRound(body.data.history ?? [], scenario);
    return postJson(ARENA_ROUND_PATH, body.data, arenaRoundResponseSchema);
  }

  if (history.length >= LIMITS.maxHistoryRounds) {
    return {
      ok: false,
      fault: {
        kind: "http",
        status: 400,
        body: {
          error: {
            code: "bad_request",
            message: "This session already has the maximum number of rounds.",
          },
          requestId: crypto.randomUUID(),
        },
      },
    };
  }

  const fixture = fixtureForRound(history.length);
  const decided = await submitDecide(
    { tab: "arena", input: { prompt: fixture.prompt } },
    scenario,
  );
  if (!decided.ok) return decided;
  const round = arenaRoundResponseSchema.safeParse({
    attack: { prompt: fixture.prompt },
    verdict: decided.data,
    round: history.length + 1,
  });
  if (!round.success) return invalidResponse(decided.modelMs ?? null);
  return { ok: true, data: round.data, modelMs: decided.modelMs ?? null };
}
