import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { ApiError } from "@/lib/http";

export type LimitResult = { success: boolean; reset: number };
export type Limiter = { limit: (key: string) => Promise<LimitResult> };
export type RateScope = "api" | "passcode";

const FAIL_CLOSED_RETRY_MS = 60_000;

const WINDOWS = {
  api: { max: 60, windowMs: 60_000, window: "60 s" },
  passcode: { max: 5, windowMs: 10 * 60_000, window: "10 m" },
} as const;

const memoryBuckets = new Map<string, number[]>();
let apiLimiter: Limiter | undefined;
let passcodeLimiter: Limiter | undefined;

export function resetMemoryRateLimitsForTests(): void {
  if (process.env.VITEST !== "true") return;
  memoryBuckets.clear();
}

export function chooseRateLimitBackend(env: Record<string, string | undefined>): "upstash" | "memory" | "closed" {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) return "upstash";
  if (env.VITEST === "true") return "memory";
  return "closed";
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim() ?? "";
    if (isIp(first)) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim() ?? "";
  if (isIp(real)) return real;
  return "unknown";
}

export async function enforceRateLimit(
  request: Request,
  scope: RateScope,
  limiter: Limiter = limiterFor(scope),
): Promise<void> {
  let result: LimitResult;
  try {
    result = await limiter.limit(`${scope}:${clientIp(request)}`);
  } catch {
    throw new ApiError("rate_limited", "Too many requests.", FAIL_CLOSED_RETRY_MS);
  }
  if (!result.success) {
    throw new ApiError("rate_limited", "Too many requests.", Math.max(0, result.reset - Date.now()));
  }
}

function limiterFor(scope: RateScope): Limiter {
  const backend = chooseRateLimitBackend(process.env);
  if (backend === "closed") {
    return {
      async limit() {
        return { success: false, reset: Date.now() + FAIL_CLOSED_RETRY_MS };
      },
    };
  }
  if (backend === "memory") return memoryLimiter(scope);
  if (scope === "api") {
    apiLimiter ??= upstashLimiter(scope);
    return apiLimiter;
  }
  passcodeLimiter ??= upstashLimiter(scope);
  return passcodeLimiter;
}

function memoryLimiter(scope: RateScope): Limiter {
  const { max, windowMs } = WINDOWS[scope];
  return {
    async limit(key: string) {
      const now = Date.now();
      const bucketKey = `${scope}:${key}`;
      const recent = (memoryBuckets.get(bucketKey) ?? []).filter((stamp) => now - stamp < windowMs);
      recent.push(now);
      memoryBuckets.set(bucketKey, recent);
      return { success: recent.length <= max, reset: (recent[0] ?? now) + windowMs };
    },
  };
}

function upstashLimiter(scope: RateScope): Limiter {
  const { max, window } = WINDOWS[scope];
  const ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(max, window),
    prefix: `d1:${scope}`,
    analytics: false,
  });
  return {
    async limit(key: string) {
      const result = await ratelimit.limit(key);
      return { success: result.success, reset: result.reset };
    },
  };
}

function isIp(value: string): boolean {
  return value.length >= 3 && value.length <= 64 && /^[0-9a-fA-F:.]+$/.test(value);
}
