import { tabSchema, type Tab } from "@/lib/contract";

const LOCAL_ORIGIN = "https://decision-demo.local";

export function tabReturnPath(tab: Tab): string {
  return `/?tab=${tab}`;
}

export function loginPathForTab(tab: Tab): string {
  return `/login?next=${encodeURIComponent(tabReturnPath(tab))}`;
}

/**
 * Accepts only a same-origin path. External URLs, protocol-relative paths,
 * and a return to /login itself fall back to the console root.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (value == null) return "/";
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return "/";

  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return "/";
  }
  if (decoded.includes("%")) {
    try {
      if (decodeURIComponent(decoded) !== decoded) return "/";
    } catch {
      return "/";
    }
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.startsWith("/\\")) return "/";
  if (decoded.includes("\\") || decoded.includes("://") || decoded.includes("\0")) return "/";

  let url: URL;
  try {
    url = new URL(decoded, LOCAL_ORIGIN);
  } catch {
    return "/";
  }
  if (url.origin !== LOCAL_ORIGIN || url.username || url.password) return "/";
  if (url.pathname === "/login" || url.pathname.startsWith("/login/")) return "/";

  const next = `${url.pathname}${url.search}${url.hash}`;
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export function tabFromPath(path: string): Tab | null {
  try {
    const url = new URL(safeNextPath(path), LOCAL_ORIGIN);
    const parsed = tabSchema.safeParse(url.searchParams.get("tab"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
