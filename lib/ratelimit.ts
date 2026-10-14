import "server-only";
import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { ApiError } from "@/lib/http";
import { MIN_SESSION_SECRET_LENGTH, readCookie, readSessionId, SESSION_COOKIE } from "@/lib/session";

export type LimitReason = "timeout" | "cacheBlock" | "denyList";
export type LimitResult = { success: boolean; reset: number; remaining: number; reason?: LimitReason };
export type Limiter = { limit: (key: string) => Promise<LimitResult> };
export type RateScope = "api" | "passcode";
export type LimitCheck = "sid" | "ip" | "global";
export type RateLimitBackend = "upstash" | "memory" | "closed";

const FAIL_CLOSED_RETRY_MS = 60_000;
const RATE_LIMIT_TIMEOUT_MS = 1_500;
const KEY_LOG_PREFIX = 12;
const PASSCODE_GLOBAL_MAX = 20;
const PASSCODE_GLOBAL_KEY = "passcode:global";
const API_GLOBAL_MAX = 600;
const API_GLOBAL_KEY = "api:global";

const WINDOWS = {
  api: { max: 60, windowMs: 60_000, window: "60 s" },
  passcode: { max: 5, windowMs: 10 * 60_000, window: "10 m" },
} as const;

const memoryBuckets = new Map<string, number[]>();
let apiLimiter: Limiter | undefined;
let apiGlobalLimiterCached: Limiter | undefined;
let passcodeLimiter: Limiter | undefined;
let passcodeGlobalLimiterCached: Limiter | undefined;

export function resetMemoryRateLimitsForTests(): void {
  if (process.env.VITEST !== "true") return;
  memoryBuckets.clear();
  apiLimiter = undefined;
  apiGlobalLimiterCached = undefined;
  passcodeLimiter = undefined;
  passcodeGlobalLimiterCached = undefined;
}

export type RedisCredentials = { url: string; token: string };

// A pair is present only when both of its variables are set. UPSTASH_ wins over KV_.
// Vercel Upstash injects KV_REST_API_URL and KV_REST_API_TOKEN; a mixed or partial pair is absent.
export function resolveRedisCredentials(env: Record<string, string | undefined>): RedisCredentials | null {
  const upstashUrl = env.UPSTASH_REDIS_REST_URL;
  const upstashToken = env.UPSTASH_REDIS_REST_TOKEN;
  if (upstashUrl && upstashToken) return { url: upstashUrl, token: upstashToken };

  const kvUrl = env.KV_REST_API_URL;
  const kvToken = env.KV_REST_API_TOKEN;
  if (kvUrl && kvToken) return { url: kvUrl, token: kvToken };

  return null;
}

export function chooseRateLimitBackend(env: Record<string, string | undefined>): "upstash" | "memory" | "closed" {
  if (resolveRedisCredentials(env)) return "upstash";
  if (env.VITEST === "true") return "memory";
  return "closed";
}

export function clientIp(request: Request): string {
  const headers = [
    request.headers.get("x-vercel-forwarded-for"),
    request.headers.get("x-forwarded-for"),
    request.headers.get("x-real-ip"),
  ];
  for (const header of headers) {
    const normalized = normalizeClientIp(firstHeaderValue(header));
    if (normalized) return normalized;
  }
  return "unknown";
}

export async function enforceRateLimit(
  request: Request,
  scope: RateScope,
  limiter: Limiter = limiterFor(scope),
): Promise<void> {
  const backend = chooseRateLimitBackend(process.env);
  if (scope === "passcode") {
    await applyLimit(limiter, `passcode:${clientIp(request)}`, "ip", backend);
    await applyLimit(passcodeGlobalLimiter(), PASSCODE_GLOBAL_KEY, "global", backend);
    return;
  }
  const sid = sessionIdForRateLimit(request);
  if (!sid) throw new ApiError("unauthorized", "Authentication required.");
  await applyLimit(limiter, `api:sid:${sid}`, "sid", backend);
  await applyLimit(apiIpLimiter(), `api:ip:${clientIp(request)}`, "ip", backend);
  await applyLimit(apiGlobalLimiter(), API_GLOBAL_KEY, "global", backend);
}

async function applyLimit(limiter: Limiter, key: string, scope: LimitCheck, backend: RateLimitBackend): Promise<void> {
  const started = Date.now();
  let result: LimitResult;
  try {
    result = await limiter.limit(key);
  } catch {
    logLimiterDecision({
      scope,
      backend,
      key,
      success: false,
      remaining: 0,
      latencyMs: Date.now() - started,
    });
    throw new ApiError("rate_limited", "Too many requests.", FAIL_CLOSED_RETRY_MS);
  }
  const timedOut = result.reason === "timeout";
  const success = result.success && !timedOut;
  logLimiterDecision({
    scope,
    backend,
    key,
    success,
    remaining: result.remaining,
    reason: result.reason,
    latencyMs: Date.now() - started,
  });
  if (!success) {
    const retryAfterMs = timedOut ? FAIL_CLOSED_RETRY_MS : Math.max(0, result.reset - Date.now());
    throw new ApiError("rate_limited", "Too many requests.", retryAfterMs);
  }
}

function logLimiterDecision(entry: {
  scope: LimitCheck;
  backend: RateLimitBackend;
  key: string;
  success: boolean;
  remaining: number;
  reason?: string;
  latencyMs: number;
}): void {
  console.info(
    JSON.stringify({
      scope: entry.scope,
      backend: entry.backend,
      key: createHash("sha256").update(entry.key).digest("hex").slice(0, KEY_LOG_PREFIX),
      success: entry.success,
      remaining: entry.remaining,
      reason: entry.reason ?? null,
      latencyMs: entry.latencyMs,
    }),
  );
}

function limiterFor(scope: RateScope): Limiter {
  if (scope === "api") return apiStandardLimiter();
  const backend = chooseRateLimitBackend(process.env);
  if (backend === "closed") return closedLimiter();
  if (backend === "memory") return memoryLimiter(WINDOWS.passcode.max, WINDOWS.passcode.windowMs);
  passcodeLimiter ??= upstashLimiter(WINDOWS.passcode.max, WINDOWS.passcode.window, "d1:passcode");
  return passcodeLimiter;
}

function apiIpLimiter(): Limiter {
  return apiStandardLimiter();
}

function apiGlobalLimiter(): Limiter {
  const backend = chooseRateLimitBackend(process.env);
  if (backend === "closed") return closedLimiter();
  if (backend === "memory") return memoryLimiter(API_GLOBAL_MAX, WINDOWS.api.windowMs);
  apiGlobalLimiterCached ??= upstashLimiter(API_GLOBAL_MAX, WINDOWS.api.window, "d1:api");
  return apiGlobalLimiterCached;
}

function apiStandardLimiter(): Limiter {
  const backend = chooseRateLimitBackend(process.env);
  if (backend === "closed") return closedLimiter();
  if (backend === "memory") return memoryLimiter(WINDOWS.api.max, WINDOWS.api.windowMs);
  apiLimiter ??= upstashLimiter(WINDOWS.api.max, WINDOWS.api.window, "d1:api");
  return apiLimiter;
}

function sessionIdForRateLimit(request: Request): string | undefined {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < MIN_SESSION_SECRET_LENGTH) return undefined;
  return readSessionId(readCookie(request, SESSION_COOKIE), secret);
}

function passcodeGlobalLimiter(): Limiter {
  const backend = chooseRateLimitBackend(process.env);
  if (backend === "closed") return closedLimiter();
  if (backend === "memory") return memoryLimiter(PASSCODE_GLOBAL_MAX, WINDOWS.passcode.windowMs);
  passcodeGlobalLimiterCached ??= upstashLimiter(PASSCODE_GLOBAL_MAX, WINDOWS.passcode.window, "d1");
  return passcodeGlobalLimiterCached;
}

function closedLimiter(): Limiter {
  return {
    async limit() {
      return { success: false, reset: Date.now() + FAIL_CLOSED_RETRY_MS, remaining: 0 };
    },
  };
}

function memoryLimiter(max: number, windowMs: number): Limiter {
  return {
    async limit(key: string) {
      const now = Date.now();
      const recent = (memoryBuckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
      recent.push(now);
      memoryBuckets.set(key, recent);
      return {
        success: recent.length <= max,
        reset: (recent[0] ?? now) + windowMs,
        remaining: Math.max(0, max - recent.length),
      };
    },
  };
}

function upstashLimiter(max: number, window: "60 s" | "10 m", prefix: string): Limiter {
  const credentials = resolveRedisCredentials(process.env);
  if (!credentials) return closedLimiter();
  const ratelimit = new Ratelimit({
    redis: new Redis({ url: credentials.url, token: credentials.token }),
    limiter: Ratelimit.slidingWindow(max, window),
    prefix,
    timeout: RATE_LIMIT_TIMEOUT_MS,
    analytics: false,
  });
  return {
    async limit(key: string) {
      const result = await ratelimit.limit(key);
      return {
        success: result.success,
        reset: result.reset,
        remaining: result.remaining,
        reason: result.reason,
      };
    },
  };
}

function firstHeaderValue(header: string | null): string {
  if (!header) return "";
  return header.split(",")[0]?.trim() ?? "";
}

function normalizeClientIp(raw: string): string | null {
  const stripped = stripIpDecoration(raw);
  if (!stripped) return null;
  const ipv4 = parseIpv4(stripped);
  if (ipv4) return ipv4;
  const ipv6 = parseIpv6(stripped);
  if (!ipv6) return null;
  if (isIpv4Mapped(ipv6)) return ipv4FromMapped(ipv6);
  return ipv6Prefix(ipv6);
}

function stripIpDecoration(raw: string): string {
  const value = raw.trim();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end <= 1) return "";
    return value.slice(1, end);
  }
  const colon = value.lastIndexOf(":");
  if (colon > 0 && value.indexOf(":") === colon) {
    const host = value.slice(0, colon);
    const port = value.slice(colon + 1);
    if (/^\d+$/.test(port) && host.includes(".")) return host;
  }
  return value;
}

function parseIpv4(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    octets.push(octet);
  }
  return octets.join(".");
}

function parseIpv6(value: string): number[] | null {
  const input = value.trim().toLowerCase();
  if (input.includes("%")) return null;
  const halves = input.split("::");
  if (halves.length > 2) return null;
  const parseSide = (side: string): string[] | null => {
    if (side === "") return [];
    const parts = side.split(":");
    const dotted = parts.at(-1);
    if (dotted?.includes(".")) {
      const ipv4 = parseIpv4(dotted);
      if (!ipv4) return null;
      const [a, b, c, d] = ipv4.split(".").map(Number);
      const hi = ((a ?? 0) << 8) | (b ?? 0);
      const lo = ((c ?? 0) << 8) | (d ?? 0);
      return [...parts.slice(0, -1), hi.toString(16), lo.toString(16)];
    }
    return parts;
  };
  let groups: string[];
  if (halves.length === 2) {
    const left = parseSide(halves[0] ?? "");
    const right = parseSide(halves[1] ?? "");
    if (!left || !right) return null;
    const missing = 8 - (left.length + right.length);
    if (missing < 1) return null;
    groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  } else {
    const parsed = parseSide(input);
    if (!parsed || parsed.length !== 8) return null;
    groups = parsed;
  }
  if (groups.length !== 8) return null;
  const numbers: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    numbers.push(Number.parseInt(group, 16));
  }
  return numbers;
}

function isIpv4Mapped(groups: number[]): boolean {
  return groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
}

function ipv4FromMapped(groups: number[]): string {
  const hi = groups[6] ?? 0;
  const lo = groups[7] ?? 0;
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

function ipv6Prefix(groups: number[]): string {
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":")}::/64`;
}
