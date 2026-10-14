import rawFixtures from "@/fixtures/arena-attacks.json";
import {
  LIMITS,
  arenaAttackFixturesSchema,
  type ArenaAttackFixture,
  type ArenaHistoryEntry,
  type ArenaRoundRequest,
  type DecideResponse,
} from "@/lib/contract";

export const arenaFixtures: ArenaAttackFixture[] = arenaAttackFixturesSchema.parse(rawFixtures);

export function capHistory<T>(history: readonly T[]): T[] {
  if (history.length <= LIMITS.maxHistoryRounds) {
    return [...history];
  }
  return history.slice(history.length - LIMITS.maxHistoryRounds);
}

export function arenaRoundBody(history: readonly ArenaHistoryEntry[]): ArenaRoundRequest {
  return { history: capHistory(history) };
}

export function fixtureForRound(roundIndex: number): ArenaAttackFixture {
  const safeIndex = ((roundIndex % arenaFixtures.length) + arenaFixtures.length) % arenaFixtures.length;
  const fixture = arenaFixtures[safeIndex];
  if (!fixture) {
    throw new Error("Arena fixtures are empty.");
  }
  return fixture;
}

/** A round counts as blocked when the service outcome is block. */
export function isDefenseBlock(verdict: DecideResponse): boolean {
  return verdict.outcome === "block";
}

export function blockRate(history: readonly ArenaHistoryEntry[]): {
  blocked: number;
  total: number;
  ratio: number;
} {
  const total = history.length;
  let blocked = 0;
  for (const entry of history) {
    if (isDefenseBlock(entry.verdict)) blocked += 1;
  }
  return { blocked, total, ratio: total === 0 ? 0 : blocked / total };
}
