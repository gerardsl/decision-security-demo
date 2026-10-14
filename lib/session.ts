import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "d1_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;
export const MIN_SESSION_SECRET_LENGTH = 16;

export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};

type SessionPayload = {
  v: 1;
  exp: number;
  sid: string;
};

const SESSION_ID_PATTERN = /^[0-9a-f]{32}$/;

export function randomSessionId(): string {
  return randomBytes(16).toString("hex");
}

export function createSessionValue(secret: string, now = Date.now(), sid = randomSessionId()): string {
  const payload = Buffer.from(
    JSON.stringify({ v: 1, exp: now + SESSION_TTL_MS, sid } satisfies SessionPayload),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySessionValue(value: string | undefined, secret: string, now = Date.now()): boolean {
  return readSessionId(value, secret, now) !== undefined;
}

export function readSessionId(value: string | undefined, secret: string, now = Date.now()): string | undefined {
  const parsed = readSessionPayload(value, secret, now);
  if (!parsed || !SESSION_ID_PATTERN.test(parsed.sid)) return undefined;
  return parsed.sid;
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    if (trimmed.slice(0, separator) !== name) continue;
    const raw = trimmed.slice(separator + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function passcodeMatches(provided: string, expected: string | undefined): boolean {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected ?? "").digest();
  const equal = timingSafeEqual(providedDigest, expectedDigest);
  return Boolean(expected) && equal;
}

function readSessionPayload(value: string | undefined, secret: string, now: number): SessionPayload | undefined {
  if (!value || !secret) return undefined;
  const separator = value.indexOf(".");
  if (separator <= 0 || value.indexOf(".", separator + 1) !== -1) return undefined;
  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (!fixedEqual(signature, expected)) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (parsed.v !== 1 || typeof parsed.exp !== "number" || parsed.exp <= now || typeof parsed.sid !== "string") {
      return undefined;
    }
    return { v: 1, exp: parsed.exp, sid: parsed.sid };
  } catch {
    return undefined;
  }
}

function fixedEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length) {
    timingSafeEqual(expectedBytes, expectedBytes);
    return false;
  }
  return timingSafeEqual(actualBytes, expectedBytes);
}
