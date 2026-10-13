import { describe, expect, test } from "vitest";
import { TABS } from "@/lib/contract";
import { loginPathForTab, safeNextPath, tabFromPath, tabReturnPath } from "@/lib/return-to";

describe("same-origin return path", () => {
  test("keeps the current tab in a login next param and reads it back", () => {
    for (const tab of TABS) {
      const href = loginPathForTab(tab);
      const url = new URL(href, "https://decision-demo.local");
      const next = safeNextPath(url.searchParams.get("next"));
      expect(next).toBe(tabReturnPath(tab));
      expect(tabFromPath(next)).toBe(tab);
    }
  });

  test("rejects off-origin and protocol-relative targets", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath("https://evil.example/phish")).toBe("/");
    expect(safeNextPath("http://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath("/%2F%2Fevil.example")).toBe("/");
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/login?next=/?tab=mcp")).toBe("/");
  });
});
