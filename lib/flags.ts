/** Public demo switches. These are the only environment variables the client may read. */

export function isMockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK === "1";
}

/** Off unless explicitly set. Fixture replay is the default arena mode. */
export function isArenaLive(): boolean {
  return process.env.NEXT_PUBLIC_ARENA_LIVE_ATTACKER === "1";
}
