import "server-only";
import { ApiError } from "@/lib/http";
import {
  createSessionValue,
  MIN_SESSION_SECRET_LENGTH,
  passcodeMatches,
  readCookie,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifySessionValue,
} from "@/lib/session";

export function sessionSecret(env: Record<string, string | undefined> = process.env): string | undefined {
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < MIN_SESSION_SECRET_LENGTH) return undefined;
  return secret;
}

export function assertSession(request: Request, env: Record<string, string | undefined> = process.env): void {
  const secret = sessionSecret(env);
  if (!secret || !verifySessionValue(readCookie(request, SESSION_COOKIE), secret)) {
    throw new ApiError("unauthorized", "Authentication required.");
  }
}

export function checkPasscode(provided: string, env: Record<string, string | undefined> = process.env): void {
  if (!passcodeMatches(provided, env.DEMO_PASSCODE)) {
    throw new ApiError("unauthorized", "Authentication required.");
  }
}

export function issueSessionCookie(secret: string, now = Date.now()) {
  return {
    name: SESSION_COOKIE,
    value: createSessionValue(secret, now),
    options: sessionCookieOptions,
  };
}
