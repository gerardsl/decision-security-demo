import { describe, expect, it } from "vitest";
import {
  apiErrorSchema,
  arenaAttackFixturesSchema,
  arenaRoundRequestSchema,
  decideRequestSchema,
  decideResponseSchema,
} from "@/lib/contract";
import fixtures from "@/fixtures/arena-attacks.json";
import { verdict } from "@/tests/helpers";

describe("contract schemas", () => {
  it("accepts each tab and rejects unknown keys", () => {
    expect(
      decideRequestSchema.safeParse({
        tab: "phishing",
        input: { sender: "a@b.co", subject: "Hello", body: "A note" },
      }).success,
    ).toBe(true);
    expect(
      decideRequestSchema.safeParse({
        tab: "soc",
        input: {
          alertId: "a-1",
          title: "Login burst",
          severity: "high",
          source: "edr",
          description: "Many failures",
        },
      }).success,
    ).toBe(true);
    expect(
      decideRequestSchema.safeParse({
        tab: "mcp",
        input: { toolName: "read_file", args: { path: "notes.txt" }, agentContext: "Summarize notes" },
      }).success,
    ).toBe(true);
    expect(decideRequestSchema.safeParse({ tab: "dlp", input: { prompt: "Draft a reply" } }).success).toBe(true);
    expect(decideRequestSchema.safeParse({ tab: "arena", input: { prompt: "Hello" } }).success).toBe(true);
    expect(
      decideRequestSchema.safeParse({
        tab: "phishing",
        input: { sender: "a@b.co", subject: "Hello", body: "A note", extra: true },
      }).success,
    ).toBe(false);
  });

  it("requires a reason only when the decision was not made", () => {
    expect(decideResponseSchema.safeParse(verdict()).success).toBe(true);
    expect(decideResponseSchema.safeParse(verdict({ reason: "lowconf" })).success).toBe(false);
    expect(
      decideResponseSchema.safeParse(verdict({ status: "blocked", reason: "timeout", confidence: 0 })).success,
    ).toBe(true);
    expect(decideResponseSchema.safeParse(verdict({ status: "undecided" })).success).toBe(false);
  });

  it("requires retryAfterMs on rate-limit errors", () => {
    const requestId = crypto.randomUUID();
    expect(
      apiErrorSchema.safeParse({
        error: { code: "rate_limited", message: "Too many requests." },
        requestId,
      }).success,
    ).toBe(false);
    expect(
      apiErrorSchema.safeParse({
        error: { code: "rate_limited", message: "Too many requests." },
        requestId,
        retryAfterMs: 1000,
      }).success,
    ).toBe(true);
    expect(
      apiErrorSchema.safeParse({
        error: { code: "bad_request", message: "Request body is invalid." },
        requestId,
      }).success,
    ).toBe(true);
  });

  it("caps arena history and loads the synthetic fixture file", () => {
    expect(arenaAttackFixturesSchema.safeParse(fixtures).success).toBe(true);
    const history = Array.from({ length: 10 }, () => ({ prompt: "synthetic", verdict: verdict() }));
    expect(arenaRoundRequestSchema.safeParse({ history }).success).toBe(true);
    expect(arenaRoundRequestSchema.safeParse({ history: [...history, history[0]] }).success).toBe(false);
    expect(arenaRoundRequestSchema.safeParse({ history: [{ prompt: "x".repeat(4001), verdict: verdict() }] }).success).toBe(
      false,
    );
  });
});
