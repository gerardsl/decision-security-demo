import { MIN_SESSION_SECRET_LENGTH, readCookie, SESSION_COOKIE, verifySessionValue } from "@/lib/session";

export const DEMO_FAULTS = ["timeout", "upstream", "lowconf"] as const;
export type DemoFault = (typeof DEMO_FAULTS)[number];

export function readDemoFault(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): DemoFault | null {
  if (env.VERCEL_ENV === "production") return null;
  if (env.DEMO_FAULT_INJECTION !== "1") return null;
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < MIN_SESSION_SECRET_LENGTH) return null;
  if (!verifySessionValue(readCookie(request, SESSION_COOKIE), secret)) return null;
  const header = request.headers.get("x-demo-fault");
  if (header === "timeout" || header === "upstream" || header === "lowconf") return header;
  return null;
}
