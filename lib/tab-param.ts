import { tabSchema, type Tab } from "@/lib/contract";

/** A missing or unknown `tab` query is the overview, not a demo tab. */
export function parseTabParam(value: string | string[] | undefined): Tab | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null || raw === "") return null;
  const parsed = tabSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
