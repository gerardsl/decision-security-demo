import "server-only";
import fixturesJson from "@/fixtures/arena-attacks.json";
import {
  arenaAttackFixturesSchema,
  arenaRoundRequestSchema,
  LIMITS,
  type ArenaHistoryEntry,
} from "@/lib/contract";
import { fetchLiveAttackPrompt } from "@/lib/attacker";
import { decide, type DecideOptions } from "@/lib/decide";
import { ApiError } from "@/lib/http";
import type { SettledDecision } from "@/lib/policy";

const fixtures = arenaAttackFixturesSchema.parse(fixturesJson);

export function fixturePromptForRound(round: number): string {
  const index = (round - 1) % fixtures.length;
  const fixture = fixtures[index];
  if (!fixture) throw new ApiError("upstream", "Upstream decision failed.");
  return fixture.prompt;
}

export function parseArenaHistory(body: unknown): ArenaHistoryEntry[] {
  const parsed = arenaRoundRequestSchema.safeParse(body);
  if (!parsed.success) throw new ApiError("bad_request", "Arena history is invalid.");
  const history = parsed.data.history ?? [];
  if (history.length >= LIMITS.maxHistoryRounds) {
    throw new ApiError("bad_request", "Arena history exceeds the round cap.");
  }
  return history;
}

export async function playArenaRound(
  body: unknown,
  options: DecideOptions = {},
): Promise<{ attack: { prompt: string }; verdict: SettledDecision; round: number }> {
  const history = parseArenaHistory(body);
  const round = history.length + 1;
  const prompt = await nextPrompt(history, round);
  const verdict = await decide({ tab: "arena", input: { prompt } }, options);
  return { attack: { prompt }, verdict, round };
}

async function nextPrompt(history: ArenaHistoryEntry[], round: number): Promise<string> {
  if (process.env.ARENA_LIVE_ATTACKER !== "1") return fixturePromptForRound(round);
  let prompt: string;
  try {
    prompt = await fetchLiveAttackPrompt(history.map((entry) => entry.prompt));
  } catch {
    throw new ApiError("upstream", "Upstream decision failed.");
  }
  if (prompt.length < 1 || prompt.length > LIMITS.arenaPrompt) {
    throw new ApiError("upstream", "Upstream decision failed.");
  }
  return prompt;
}
