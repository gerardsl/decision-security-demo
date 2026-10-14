import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as passcode } from "@/app/api/auth/passcode/route";
import { assertSession } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { pageGate } from "@/lib/page-gate";
import { proxy } from "@/proxy";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionValue,
  passcodeMatches,
  readSessionId,
  verifySessionValue,
} from "@/lib/session";
import { DEMO_PASSCODE, SESSION_SECRET, postJson, sessionCookie } from "@/tests/helpers";

describe("passcode session", () => {
  it("compares the passcode in constant time and rejects mismatches", () => {
    expect(passcodeMatches(DEMO_PASSCODE, DEMO_PASSCODE)).toBe(true);
    expect(passcodeMatches("nope", DEMO_PASSCODE)).toBe(false);
    expect(passcodeMatches("short", "much-longer-passcode")).toBe(false);
    expect(passcodeMatches("", undefined)).toBe(false);
    expect(passcodeMatches("", "")).toBe(false);
  });

  it("sets an HttpOnly Secure SameSite=Lax cookie and rejects bad cookies", async () => {
    const response = await passcode(
      postJson(
        "http://localhost/api/auth/passcode",
        { passcode: DEMO_PASSCODE },
        new Headers({ "content-type": "application/json", "x-forwarded-for": "203.0.113.20" }),
      ),
    );
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("secure");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).not.toContain(SESSION_SECRET);
    expect(setCookie).not.toContain(DEMO_PASSCODE);

    const value = setCookie.split(";")[0]?.slice(`${SESSION_COOKIE}=`.length) ?? "";
    expect(verifySessionValue(value, SESSION_SECRET)).toBe(true);
    const issued = JSON.parse(Buffer.from(value.split(".")[0] ?? "", "base64url").toString("utf8")) as { sid?: string };
    expect(issued.sid).toMatch(/^[0-9a-f]{32}$/);
    expect(verifySessionValue(value, "another-session-secret")).toBe(false);
    expect(verifySessionValue(`${value}x`, SESSION_SECRET)).toBe(false);
    const expired = createSessionValue(SESSION_SECRET, Date.now() - SESSION_TTL_MS - 5_000);
    expect(verifySessionValue(expired, SESSION_SECRET)).toBe(false);

    expect(() => assertSession(new Request("http://localhost/api/decide"))).toThrow(ApiError);
    expect(() =>
      assertSession(new Request("http://localhost/api/decide", { headers: { cookie: sessionCookie() } })),
    ).not.toThrow();
  });

  it("gates pages in the proxy and API routes in both places", async () => {
    expect(pageGate("/login", false)).toBe("allow");
    expect(pageGate("/api/auth/passcode", false)).toBe("allow");
    expect(pageGate("/", false)).toBe("redirect-login");
    expect(pageGate("/api/decide", false)).toBe("unauthorized");
    expect(pageGate("/api/decide", true)).toBe("allow");

    const redirect = proxy(new NextRequest("http://localhost/"));
    expect(redirect.headers.get("location")).toBe("http://localhost/login");
    const denied = proxy(new NextRequest("http://localhost/api/decide"));
    expect(denied.status).toBe(401);
    const allowed = proxy(
      new NextRequest("http://localhost/", { headers: { cookie: sessionCookie() } }),
    );
    expect(allowed.headers.get("location")).toBeNull();
    const login = proxy(new NextRequest("http://localhost/login"));
    expect(login.status).not.toBe(401);
    expect(login.headers.get("location")).toBeNull();
  });

  it("rejects a signed cookie that has no session id", () => {
    const payload = Buffer.from(JSON.stringify({ v: 1, exp: Date.now() + 60_000 })).toString("base64url");
    const signature = createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
    const value = `${payload}.${signature}`;
    expect(verifySessionValue(value, SESSION_SECRET)).toBe(false);
    expect(readSessionId(value, SESSION_SECRET)).toBeUndefined();
    expect(() =>
      assertSession(
        new Request("http://localhost/api/decide", { headers: { cookie: `${SESSION_COOKIE}=${value}` } }),
      ),
    ).toThrow(ApiError);
    try {
      assertSession(
        new Request("http://localhost/api/decide", { headers: { cookie: `${SESSION_COOKIE}=${value}` } }),
      );
    } catch (error) {
      expect(error).toMatchObject({ status: 401, code: "unauthorized", message: "Authentication required." });
    }

    const redirect = proxy(
      new NextRequest("http://localhost/", { headers: { cookie: `${SESSION_COOKIE}=${value}` } }),
    );
    expect(redirect.headers.get("location")).toBe("http://localhost/login");
    const denied = proxy(
      new NextRequest("http://localhost/api/decide", { headers: { cookie: `${SESSION_COOKIE}=${value}` } }),
    );
    expect(denied.status).toBe(401);
  });
});
