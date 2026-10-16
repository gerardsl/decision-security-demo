import { z } from "zod";

/**
 * Shared API contract for the Decision-1 Security Demo.
 * Request and response shapes live here so the UI and the route handlers
 * validate the same objects. Question wording and fail-closed behavior are
 * applied on the server; this module only describes the wire format.
 */

export const TABS = ["phishing", "soc", "mcp", "dlp", "arena"] as const;

export const tabSchema = z.enum(TABS);
export type Tab = z.infer<typeof tabSchema>;

export const LIMITS = {
  maxBodyBytes: 65_536,
  maxHistoryRounds: 10,
  arenaPrompt: 4_000,
  phishingSender: 320,
  phishingSubject: 300,
  phishingBody: 20_000,
  socAlertId: 128,
  socTitle: 300,
  socSeverity: 64,
  socSource: 128,
  socDescription: 8_000,
  socTimestamp: 64,
  socHost: 256,
  socUser: 256,
  mcpToolName: 128,
  mcpArgsJson: 8_000,
  mcpAgentContext: 8_000,
  dlpPrompt: 20_000,
  rationale: 2_000,
  passcode: 200,
} as const;

/** Confidence below this is not a decision the closed tabs will act on. */
export const CONFIDENCE_THRESHOLD = 0.7;

export const FAIL_CLOSED_TABS = ["mcp", "dlp", "arena"] as const;
export const FAIL_OPEN_TABS = ["phishing", "soc"] as const;

export const tabPolicy = {
  phishing: { failMode: "open", decisionType: "yesno" },
  soc: { failMode: "open", decisionType: "choice" },
  mcp: { failMode: "closed", decisionType: "yesno" },
  dlp: { failMode: "closed", decisionType: "score" },
  arena: { failMode: "closed", decisionType: "yesno" },
} as const satisfies Record<
  Tab,
  { failMode: "open" | "closed"; decisionType: "yesno" | "choice" | "score" }
>;

export const SOC_OPTIONS = [
  {
    label: "benign",
    description: "Expected activity, false positive, or no action required.",
  },
  {
    label: "suspicious",
    description: "Unusual activity that needs a person to review before action.",
  },
  {
    label: "malicious",
    description: "Confirmed or strongly indicated hostile activity.",
  },
] as const;

export const DLP_LEVELS = [
  { index: 0, label: "none" },
  { index: 1, label: "low" },
  { index: 2, label: "medium" },
  { index: 3, label: "high" },
  { index: 4, label: "critical" },
] as const;

export const DLP_SCORE_RANGE = { min: 0, max: 4 } as const;

/** DLP blocks when the probability-weighted score is at or above this float. */
export const DLP_BLOCK_SCORE = 2;

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const phishingInputSchema = z
  .object({
    sender: boundedText(LIMITS.phishingSender),
    subject: boundedText(LIMITS.phishingSubject),
    body: boundedText(LIMITS.phishingBody),
  })
  .strict();

export const socInputSchema = z
  .object({
    alertId: boundedText(LIMITS.socAlertId),
    title: boundedText(LIMITS.socTitle),
    severity: boundedText(LIMITS.socSeverity),
    source: boundedText(LIMITS.socSource),
    description: boundedText(LIMITS.socDescription),
    timestamp: z.string().trim().min(1).max(LIMITS.socTimestamp).optional(),
    host: z.string().trim().min(1).max(LIMITS.socHost).optional(),
    user: z.string().trim().min(1).max(LIMITS.socUser).optional(),
  })
  .strict();

export const mcpInputSchema = z
  .object({
    toolName: boundedText(LIMITS.mcpToolName),
    args: z.record(z.string(), z.unknown()),
    agentContext: z.string().max(LIMITS.mcpAgentContext),
  })
  .strict()
  .superRefine((value, ctx) => {
    let encoded = "";
    try {
      encoded = JSON.stringify(value.args);
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["args"],
        message: "Tool arguments must be JSON-serializable.",
      });
      return;
    }
    if (encoded.length > LIMITS.mcpArgsJson) {
      ctx.addIssue({
        code: "custom",
        path: ["args"],
        message: `Tool arguments must be at most ${LIMITS.mcpArgsJson} characters when serialized.`,
      });
    }
  });

export const dlpInputSchema = z
  .object({
    prompt: boundedText(LIMITS.dlpPrompt),
  })
  .strict();

export const arenaInputSchema = z
  .object({
    prompt: boundedText(LIMITS.arenaPrompt),
  })
  .strict();

export const decideRequestSchema = z.discriminatedUnion("tab", [
  z.object({ tab: z.literal("phishing"), input: phishingInputSchema }).strict(),
  z.object({ tab: z.literal("soc"), input: socInputSchema }).strict(),
  z.object({ tab: z.literal("mcp"), input: mcpInputSchema }).strict(),
  z.object({ tab: z.literal("dlp"), input: dlpInputSchema }).strict(),
  z.object({ tab: z.literal("arena"), input: arenaInputSchema }).strict(),
]);

export const yesNoDecisionSchema = z
  .object({
    type: z.literal("yesno"),
    value: z.boolean(),
  })
  .strict();

export const choiceOptionSchema = z
  .object({
    label: z.string().min(1),
    score: z.number().min(0).max(1).optional(),
  })
  .strict();

export const probabilityMapSchema = z.record(z.string(), z.number().min(0).max(1));

export const choiceDecisionSchema = z
  .object({
    type: z.literal("choice"),
    value: z.string().min(1),
    options: z.array(choiceOptionSchema).min(1),
    probabilities: probabilityMapSchema,
  })
  .strict();

export const scoreDecisionSchema = z
  .object({
    type: z.literal("score"),
    value: z.number(),
    min: z.number(),
    max: z.number(),
    probabilities: probabilityMapSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.min > value.max) {
      ctx.addIssue({
        code: "custom",
        path: ["min"],
        message: "min must be less than or equal to max.",
      });
    }
    if (value.value < value.min || value.value > value.max) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "score must be inside min and max.",
      });
    }
  });

export const decisionSchema = z.discriminatedUnion("type", [
  yesNoDecisionSchema,
  choiceDecisionSchema,
  scoreDecisionSchema,
]);

export const outcomeSchema = z.enum(["allow", "block", "undecided"]);

/**
 * Transport outcome of the upstream Decision-1 fetch.
 * `ok` means the response body was fully read. `timeout` and `error` are call
 * failures. Null means the server never attempted that fetch.
 */
export const modelStatusSchema = z.enum(["ok", "error", "timeout"]);

export const decisionReasonSchema = z.enum([
  "policy_unsafe",
  "low_confidence",
  "timeout",
  "upstream_error",
  "score_threshold",
  "invalid_option",
  "invalid_tool_name",
  "ok",
]);

export const decideResponseSchema = z
  .object({
    decision: decisionSchema,
    confidence: z.number().min(0).max(1),
    rationale: z.string().max(LIMITS.rationale).optional(),
    outcome: outcomeSchema,
    reason: decisionReasonSchema,
    /** Handler total, from the start of the route. Unchanged by model timing. */
    latencyMs: z.number().nonnegative(),
    /**
     * Integer milliseconds for the upstream Decision-1 fetch only: from just
     * before `fetch` until the response body is fully read. Excludes token
     * acquisition, input validation, and rate-limit checks. On timeout or
     * transport failure this is the time until that failure. Null when the
     * fetch timer never started.
     *
     * Mock mode (`lib/mock-api.ts`) reports a simulated duration that is an
     * integer less than or equal to `latencyMs`, not null. Null stays valid
     * so a response that never called the model still parses.
     */
    modelMs: z.number().int().nonnegative().nullable(),
    /** See `modelStatusSchema`. Null when no Decision-1 fetch was attempted. */
    modelStatus: modelStatusSchema.nullable(),
    requestId: z.string().uuid(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.outcome === "allow" && value.reason !== "ok") {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "An allow outcome uses reason ok.",
      });
    }
    if (value.outcome !== "allow" && value.reason === "ok") {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Only an allow outcome uses reason ok.",
      });
    }
  });

export const errorCodeSchema = z.enum([
  "bad_request",
  "unauthorized",
  "rate_limited",
  "upstream",
]);

export const API_ERROR_STATUS = {
  bad_request: 400,
  unauthorized: 401,
  rate_limited: 429,
  upstream: 502,
} as const;

export const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: errorCodeSchema,
        message: z.string().min(1),
      })
      .strict(),
    requestId: z.string().uuid(),
    retryAfterMs: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.error.code === "rate_limited" && value.retryAfterMs === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["retryAfterMs"],
        message: "Rate limit errors include retryAfterMs.",
      });
    }
  });

export const arenaHistoryEntrySchema = z
  .object({
    prompt: boundedText(LIMITS.arenaPrompt),
    verdict: decideResponseSchema,
  })
  .strict();

/** Synthetic arena fixtures. `fixtureIndex` is 1-based and stops at this length. */
const ARENA_FIXTURE_COUNT = 30;

export const arenaRoundRequestSchema = z
  .object({
    history: z.array(arenaHistoryEntrySchema).max(LIMITS.maxHistoryRounds).optional(),
    fixtureIndex: z.number().int().min(1).max(ARENA_FIXTURE_COUNT).optional(),
  })
  .strict();

export const arenaRoundResponseSchema = z
  .object({
    attack: z
      .object({
        prompt: boundedText(LIMITS.arenaPrompt),
      })
      .strict(),
    verdict: decideResponseSchema,
    round: z.number().int().min(1).max(LIMITS.maxHistoryRounds),
  })
  .strict();

export const passcodeRequestSchema = z
  .object({
    passcode: z.string().min(1).max(LIMITS.passcode),
  })
  .strict();

export const passcodeSuccessSchema = z
  .object({
    ok: z.literal(true),
    requestId: z.string().uuid(),
  })
  .strict();

export const arenaAttackFixtureSchema = z
  .object({
    id: z.string().regex(/^atk-\d{2}$/),
    category: z.string().trim().min(1).max(64),
    prompt: boundedText(LIMITS.arenaPrompt),
  })
  .strict();

export const arenaAttackFixturesSchema = z.array(arenaAttackFixtureSchema).length(ARENA_FIXTURE_COUNT);

export type PhishingInput = z.infer<typeof phishingInputSchema>;
export type SocInput = z.infer<typeof socInputSchema>;
export type McpInput = z.infer<typeof mcpInputSchema>;
export type DlpInput = z.infer<typeof dlpInputSchema>;
export type ArenaInput = z.infer<typeof arenaInputSchema>;
export type DecideRequest = z.infer<typeof decideRequestSchema>;
export type YesNoDecision = z.infer<typeof yesNoDecisionSchema>;
export type ChoiceOption = z.infer<typeof choiceOptionSchema>;
export type ChoiceDecision = z.infer<typeof choiceDecisionSchema>;
export type ScoreDecision = z.infer<typeof scoreDecisionSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type Outcome = z.infer<typeof outcomeSchema>;
export type ModelStatus = z.infer<typeof modelStatusSchema>;
export type DecisionReason = z.infer<typeof decisionReasonSchema>;
export type DecideResponse = z.infer<typeof decideResponseSchema>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
export type ArenaHistoryEntry = z.infer<typeof arenaHistoryEntrySchema>;
export type ArenaRoundRequest = z.infer<typeof arenaRoundRequestSchema>;
export type ArenaRoundResponse = z.infer<typeof arenaRoundResponseSchema>;
export type PasscodeRequest = z.infer<typeof passcodeRequestSchema>;
export type PasscodeSuccess = z.infer<typeof passcodeSuccessSchema>;
export type ArenaAttackFixture = z.infer<typeof arenaAttackFixtureSchema>;
