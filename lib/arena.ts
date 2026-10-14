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

export function fixturePromptForRound(round: number, fixtureIndex?: number): string {
  const index = fixtureIndex === undefined ? (round - 1) % fixtures.length : fixtureIndex - 1;
  const fixture = fixtures[index];
  if (!fixture) {
    if (fixtureIndex !== undefined) throw new ApiError("bad_request", "Arena fixture index is invalid.");
    throw new ApiError("upstream", "Upstream decision failed.");
  }
  return fixture.prompt;
}

export function parseArenaHistory(body: unknown): ArenaHistoryEntry[] {
  return parseArenaRound(body).history;
}

function parseArenaRound(body: unknown): { history: ArenaHistoryEntry[]; fixtureIndex?: number } {
  const parsed = arenaRoundRequestSchema.safeParse(body);
  if (!parsed.success) throw new ApiError("bad_request", "Arena history is invalid.");
  const history = parsed.data.history ?? [];
  if (history.length >= LIMITS.maxHistoryRounds) {
    throw new ApiError("bad_request", "Arena history exceeds the round cap.");
  }
  return { history, fixtureIndex: parsed.data.fixtureIndex };
}

export async function playArenaRound(
  body: unknown,
  options: DecideOptions = {},
): Promise<{ attack: { prompt: string }; verdict: SettledDecision; round: number }> {
  const { history, fixtureIndex } = parseArenaRound(body);
  const round = history.length + 1;
  const prompt = await nextPrompt(history, round, fixtureIndex);
  const verdict = await decide({ tab: "arena", input: { prompt } }, options);
  return { attack: { prompt }, verdict, round };
}

async function nextPrompt(
  history: ArenaHistoryEntry[],
  round: number,
  fixtureIndex?: number,
): Promise<string> {
  if (process.env.ARENA_LIVE_ATTACKER !== "1") return fixturePromptForRound(round, fixtureIndex);
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
