import { beforeEach, vi } from "vitest";
import { resetMemoryRateLimitsForTests } from "@/lib/ratelimit";
import { ATTACKER_API_KEY, AZURE_CLIENT_SECRET, DEMO_PASSCODE, SESSION_SECRET } from "@/tests/helpers";

vi.mock("@upstash/redis", () => ({
  Redis: class Redis {
    constructor(_config: { url: string; token: string }) {}
  },
}));

vi.mock("@upstash/ratelimit", async () => {
  const { redisMock } = await import("./redis-mock-state");
  return {
    Ratelimit: class Ratelimit {
      private readonly tokens: number;
      private readonly prefix: string;

      constructor(config: { prefix?: string; timeout?: number; limiter: { tokens: number; window: string } }) {
        this.tokens = config.limiter.tokens;
        this.prefix = config.prefix ?? "";
        redisMock.configs.push({
          timeout: config.timeout,
          prefix: config.prefix,
          tokens: config.limiter.tokens,
          window: config.limiter.window,
        });
      }

      static slidingWindow(tokens: number, window: string) {
        return { tokens, window };
      }

      async limit(identifier: string) {
        redisMock.identifiers.push(identifier);
        const bucket = `${this.prefix}:${identifier}`;
        const count = (redisMock.counts.get(bucket) ?? 0) + 1;
        redisMock.counts.set(bucket, count);
        return {
          success: count <= this.tokens,
          limit: this.tokens,
          remaining: Math.max(0, this.tokens - count),
          reset: Date.now() + 60_000,
          pending: Promise.resolve(),
        };
      }
    },
  };
});

beforeEach(() => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.DEMO_PASSCODE = DEMO_PASSCODE;
  process.env.AZURE_CLIENT_SECRET = AZURE_CLIENT_SECRET;
  process.env.ATTACKER_API_KEY = ATTACKER_API_KEY;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.DEMO_FAULT_INJECTION;
  delete process.env.ARENA_LIVE_ATTACKER;
  delete process.env.ATTACKER_ENDPOINT;
  delete process.env.ATTACKER_MODEL;
  delete process.env.VERCEL_ENV;
  resetMemoryRateLimitsForTests();
});
