import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pageGate } from "@/lib/page-gate";
import { MIN_SESSION_SECRET_LENGTH, SESSION_COOKIE, verifySessionValue } from "@/lib/session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const decision = pageGate(pathname, hasSession(request));
  if (decision === "allow") return NextResponse.next();
  if (decision === "unauthorized") {
    return NextResponse.json(
      {
        error: { code: "unauthorized", message: "Authentication required." },
        requestId: crypto.randomUUID(),
      },
      { status: 401 },
    );
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

function hasSession(request: NextRequest): boolean {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < MIN_SESSION_SECRET_LENGTH) return false;
  return verifySessionValue(request.cookies.get(SESSION_COOKIE)?.value, secret);
}
