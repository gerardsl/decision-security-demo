import { beforeEach } from "vitest";
import { resetMemoryRateLimitsForTests } from "@/lib/ratelimit";
import { ATTACKER_API_KEY, AZURE_CLIENT_SECRET, DEMO_PASSCODE, SESSION_SECRET } from "@/tests/helpers";

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
