export type PageGate = "allow" | "redirect-login" | "unauthorized";

export function pageGate(pathname: string, sessionValid: boolean): PageGate {
  if (pathname === "/login" || pathname.startsWith("/api/auth/passcode")) return "allow";
  if (sessionValid) return "allow";
  if (pathname.startsWith("/api/")) return "unauthorized";
  return "redirect-login";
}
