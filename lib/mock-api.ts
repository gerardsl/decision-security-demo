import {
  CONFIDENCE_THRESHOLD,
  DLP_BLOCK_SCORE,
  DLP_SCORE_RANGE,
  LIMITS,
  SOC_OPTIONS,
  apiErrorSchema,
  arenaRoundResponseSchema,
  decideResponseSchema,
  passcodeSuccessSchema,
  tabPolicy,
  type ApiErrorBody,
  type ArenaHistoryEntry,
  type ArenaRoundResponse,
  type DecideRequest,
  type DecideResponse,
  type Decision,
  type DecisionReason,
  type PasscodeSuccess,
  type Tab,
} from "@/lib/contract";
import { fixtureForRound } from "@/lib/arena-session";
import type { ClientFault, TransportResult } from "@/lib/transport";

export const MOCK_SCENARIOS = [
  "nominal",
  "lowconf",
  "timeout",
  "upstream",
  "invalid_option",
  "bad_request",
  "unauthorized",
  "rate_limited",
  "plain_error",
] as const;

export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export const MOCK_SCENARIO_LABELS: Record<MockScenario, string> = {
  nominal: "Nominal decision",
  lowconf: "Low confidence (200)",
  timeout: "Timeout decision (502)",
  upstream: "Upstream decision (502)",
  invalid_option: "Invalid option (502)",
  bad_request: "Bad input (400)",
  unauthorized: "No session (401)",
  rate_limited: "Rate limited (429)",
  plain_error: "Plain error (502)",
};

const MOCK_DELAY_MS = 180;
const LOW_CONFIDENCE = 0.6;
const NOMINAL_CONFIDENCE = 0.91;

const DECISION_FAULTS = {
  timeout: "timeout",
  upstream: "upstream_error",
  invalid_option: "invalid_option",
} as const satisfies Partial<Record<MockScenario, DecisionReason>>;

function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function requestId(): string {
  return crypto.randomUUID();
}

function errorBody(
  code: ApiErrorBody["error"]["code"],
  message: string,
  retryAfterMs?: number,
): ApiErrorBody {
  const body: ApiErrorBody = {
    error: { code, message },
    requestId: requestId(),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  };
  return apiErrorSchema.parse(body);
}

function httpFault(status: number, body: unknown): TransportResult<never> {
  return { ok: false, fault: { kind: "http", status, body } };
}

function envelopeFault(scenario: MockScenario): TransportResult<never> | null {
  if (scenario === "bad_request") {
    return httpFault(400, errorBody("bad_request", "The sample failed server-side validation."));
  }
  if (scenario === "unauthorized") {
    return httpFault(401, errorBody("unauthorized", "Authentication required."));
  }
  if (scenario === "rate_limited") {
    return httpFault(
      429,
      errorBody("rate_limited", "Too many requests for this demo session.", 12_000),
    );
  }
  if (scenario === "plain_error") {
    return httpFault(
      502,
      errorBody("upstream", "The service failed before it could settle a decision."),
    );
  }
  return null;
}

function placeholderDecision(tab: Tab): Decision {
  switch (tabPolicy[tab].decisionType) {
    case "yesno":
      return { type: "yesno", value: false };
    case "choice":
      return {
        type: "choice",
        value: "suspicious",
        options: SOC_OPTIONS.map((option) => ({ label: option.label })),
        probabilities: {},
      };
    case "score":
      return {
        type: "score",
        value: DLP_SCORE_RANGE.max,
        min: DLP_SCORE_RANGE.min,
        max: DLP_SCORE_RANGE.max,
        probabilities: {},
      };
  }
}

function failureBody(tab: Tab, reason: DecisionReason): DecideResponse {
  const closed = tabPolicy[tab].failMode === "closed";
  return decideResponseSchema.parse({
    decision: placeholderDecision(tab),
    confidence: 0,
    rationale: `Synthetic mock failure for ${tab}. The service settled reason ${reason} without copying a model label.`,
    outcome: closed ? "block" : "undecided",
    reason,
    latencyMs: reason === "timeout" ? 30_000 : 48,
    requestId: requestId(),
  });
}

function decisionFault(tab: Tab, scenario: MockScenario): ClientFault | null {
  const reason = DECISION_FAULTS[scenario as keyof typeof DECISION_FAULTS];
  if (!reason) return null;
  return { kind: "http", status: 502, body: failureBody(tab, reason) };
}

function phishingYes(input: { sender: string; subject: string; body: string }): boolean {
  const blob = `${input.subject} ${input.body}`.toLowerCase();
  return /payroll|password|wire|gift card|credential|verify/.test(blob);
}

function socChoice(input: { title: string; description: string; severity: string }): string {
  const blob = `${input.title} ${input.description} ${input.severity}`.toLowerCase();
  if (/ransom|mimikatz|exfil/.test(blob)) return "malicious";
  if (/powershell|anomal|unusual|encoded/.test(blob)) return "suspicious";
  return "benign";
}

function mcpAllowed(toolName: string): boolean {
  return !/shell|exec|send_email|exfil|delete|write/.test(toolName.toLowerCase());
}

function dlpScore(prompt: string): number {
  const text = prompt.toLowerCase();
  if (/ssn|social security|123-45-6789|api key|sk-demo/.test(text)) return 3.4;
  if (/confidential|salary|customer list/.test(text)) return 2.97;
  return 0.15;
}

function choiceProbabilities(value: string): Record<string, number> {
  return {
    benign: value === "benign" ? 0.8 : 0.1,
    suspicious: value === "suspicious" ? 0.8 : 0.1,
    malicious: value === "malicious" ? 0.8 : 0.1,
  };
}

function scoreProbabilities(value: number): Record<string, number> {
  const nearest = Math.round(Math.min(DLP_SCORE_RANGE.max, Math.max(DLP_SCORE_RANGE.min, value)));
  const probabilities: Record<string, number> = {};
  for (let level = DLP_SCORE_RANGE.min; level <= DLP_SCORE_RANGE.max; level += 1) {
    probabilities[String(level)] = level === nearest ? 0.7 : 0.075;
  }
  return probabilities;
}

function decisionFor(request: DecideRequest): Decision {
  switch (request.tab) {
    case "phishing":
      return { type: "yesno", value: phishingYes(request.input) };
    case "soc": {
      const value = socChoice(request.input);
      return {
        type: "choice",
        value,
        options: SOC_OPTIONS.map((option) => ({
          label: option.label,
          score: choiceProbabilities(value)[option.label],
        })),
        probabilities: choiceProbabilities(value),
      };
    }
    case "mcp":
      return { type: "yesno", value: mcpAllowed(request.input.toolName) };
    case "dlp": {
      const value = dlpScore(request.input.prompt);
      return {
        type: "score",
        value,
        min: DLP_SCORE_RANGE.min,
        max: DLP_SCORE_RANGE.max,
        probabilities: scoreProbabilities(value),
      };
    }
    case "arena":
      return { type: "yesno", value: hashText(request.input.prompt) % 5 !== 0 };
  }
}

function rationaleFor(tab: Tab, decision: Decision): string {
  if (decision.type === "yesno") {
    return `Synthetic mock rationale for ${tab}: the yes/no value is ${decision.value ? "yes" : "no"}.`;
  }
  if (decision.type === "choice") {
    return `Synthetic mock rationale for ${tab}: the routed label is ${decision.value}.`;
  }
  return `Synthetic mock rationale for ${tab}: the score is ${decision.value} on a ${decision.min} to ${decision.max} scale.`;
}

function isAllowAnswer(tab: Tab, decision: Decision): boolean {
  if (tab === "dlp") return decision.type === "score" && decision.value < DLP_BLOCK_SCORE;
  if (decision.type === "yesno") return decision.value;
  return false;
}

/** Mock-only stand-in for the server policy. The UI does not call this. */
function settle(tab: Tab, decision: Decision, confidence: number): DecideResponse {
  let outcome: DecideResponse["outcome"] = "allow";
  let reason: DecisionReason = "ok";
  if (confidence < CONFIDENCE_THRESHOLD) {
    outcome = tabPolicy[tab].failMode === "closed" ? "block" : "undecided";
    reason = "low_confidence";
  } else if (tabPolicy[tab].failMode === "closed" && !isAllowAnswer(tab, decision)) {
    outcome = "block";
    reason = tab === "dlp" ? "score_threshold" : "policy_unsafe";
  }
  return decideResponseSchema.parse({
    decision,
    confidence,
    rationale: rationaleFor(tab, decision),
    outcome,
    reason,
    latencyMs: confidence < CONFIDENCE_THRESHOLD ? 240 : 160,
    requestId: requestId(),
  });
}

export function mockDecideSync(
  request: DecideRequest,
  scenario: MockScenario,
): TransportResult<DecideResponse> {
  const decided = decisionFault(request.tab, scenario);
  if (decided) return { ok: false, fault: decided };
  const envelope = envelopeFault(scenario);
  if (envelope) return envelope;

  const confidence = scenario === "lowconf" ? LOW_CONFIDENCE : NOMINAL_CONFIDENCE;
  return { ok: true, data: settle(request.tab, decisionFor(request), confidence) };
}

export async function mockDecide(
  request: DecideRequest,
  scenario: MockScenario,
): Promise<TransportResult<DecideResponse>> {
  await delay(MOCK_DELAY_MS);
  return mockDecideSync(request, scenario);
}

export function mockPasscodeSync(scenario: MockScenario): TransportResult<PasscodeSuccess> {
  const envelope = envelopeFault(scenario);
  if (envelope) return envelope;
  return { ok: true, data: passcodeSuccessSchema.parse({ ok: true, requestId: requestId() }) };
}

export async function mockPasscode(
  scenario: MockScenario,
): Promise<TransportResult<PasscodeSuccess>> {
  await delay(MOCK_DELAY_MS);
  return mockPasscodeSync(scenario);
}

export function mockArenaRoundSync(
  history: readonly ArenaHistoryEntry[],
  scenario: MockScenario,
): TransportResult<ArenaRoundResponse> {
  const decided = decisionFault("arena", scenario);
  if (decided) return { ok: false, fault: decided };
  const envelope = envelopeFault(scenario);
  if (envelope) return envelope;
  if (history.length >= LIMITS.maxHistoryRounds) {
    return httpFault(
      400,
      errorBody("bad_request", "History is already at the maximum number of rounds."),
    );
  }
  const round = history.length + 1;
  const fixture = fixtureForRound(history.length);
  const verdict = mockDecideSync(
    { tab: "arena", input: { prompt: fixture.prompt } },
    scenario === "lowconf" ? "lowconf" : "nominal",
  );
  if (!verdict.ok) return verdict;
  return {
    ok: true,
    data: arenaRoundResponseSchema.parse({
      attack: { prompt: fixture.prompt },
      verdict: verdict.data,
      round,
    }),
  };
}

export async function mockArenaRound(
  history: readonly ArenaHistoryEntry[],
  scenario: MockScenario,
): Promise<TransportResult<ArenaRoundResponse>> {
  await delay(MOCK_DELAY_MS);
  return mockArenaRoundSync(history, scenario);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
