import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { DemoApp } from "@/components/DemoApp";
import { MockDataBanner } from "@/components/MockDataBanner";
import { INTRO_USE_CASES } from "@/components/intro-content";
import { CONFIDENCE_THRESHOLD, DLP_BLOCK_SCORE, TABS, type Tab } from "@/lib/contract";
import { arenaFixtures } from "@/lib/arena-session";
import { parseTabParam } from "@/lib/tab-param";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    replace,
    refresh: vi.fn(),
  }),
}));

const PANEL_HEADING: Record<Tab, string> = {
  phishing: "Phishing triage",
  soc: "SOC alert router",
  mcp: "MCP tool-call guardrail",
  dlp: "DLP for AI prompts",
  arena: "Red vs Blue arena",
};

describe("decision intro", () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    vi.unstubAllEnvs();
  });

  test("treats a missing tab as the overview and keeps a named tab", () => {
    expect(parseTabParam(undefined)).toBeNull();
    expect(parseTabParam("")).toBeNull();
    expect(parseTabParam("not-a-tab")).toBeNull();
    expect(parseTabParam(["soc", "mcp"])).toBe("soc");
    for (const tab of TABS) expect(parseTabParam(tab)).toBe(tab);
  });

  test("renders five use cases with the API thresholds", () => {
    render(<DemoApp initialTab={null} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "Microsoft Decision-1 on Azure Foundry",
    );
    expect(screen.getByText(/typed, calibrated decisions/)).toBeTruthy();
    expect(screen.getByText(/All inputs are synthetic presets/)).toBeTruthy();

    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(5);
    expect(INTRO_USE_CASES.map((useCase) => useCase.title)).toEqual([
      "Phishing",
      "SOC",
      "MCP",
      "DLP",
      "Arena",
    ]);

    const phishing = textOf("use-case-phishing");
    expect(phishing).toMatch(/yes\/no/i);
    expect(phishing).toContain("Undecided");
    expect(phishing).toContain("not a block");
    expect(screen.getByRole("heading", { level: 3, name: "Phishing" })).toBeTruthy();

    const soc = textOf("use-case-soc");
    expect(soc).toContain("triage category");
    expect(soc).toContain("probabilities");
    expect(soc).toContain("Undecided");
    expect(soc).toContain("Decision type: choice");

    const mcp = textOf("use-case-mcp");
    expect(mcp).toContain(`${CONFIDENCE_THRESHOLD * 100}%`);
    expect(mcp).toContain("fail closed");
    expect(mcp).toContain("plain identifiers");
    expect(mcp).toContain("clear yes");

    const dlp = textOf("use-case-dlp");
    expect(dlp).toContain("0–4");
    expect(dlp).toContain(`≥ ${DLP_BLOCK_SCORE.toFixed(1)}`);
    expect(dlp).toContain("Decision type: score");

    const arena = textOf("use-case-arena");
    const blockedTarget = Math.round(arenaFixtures.length * 0.9);
    expect(arenaFixtures).toHaveLength(30);
    expect(blockedTarget).toBe(27);
    expect(arena).toContain("30 synthetic attacks");
    expect(arena).toContain(`at least ${blockedTarget} of ${arenaFixtures.length} (90%) blocked`);
    expect(arena).toContain("target");
    expect(arena).not.toMatch(/100\s*%/);
    expect(arena.toLowerCase()).not.toMatch(/all attacks|every attack|blocks all|block every/);

    expect(screen.getByTestId("start-demo").tagName).toBe("BUTTON");
    for (const tab of TABS) {
      const control = screen.getByTestId(`try-${tab}`);
      expect(control.tagName).toBe("BUTTON");
      expect(control.textContent).toContain("Try it");
      expect(control.textContent).toContain(
        INTRO_USE_CASES.find((useCase) => useCase.id === tab)?.title,
      );
    }
  });

  test("each Try it opens that tab", () => {
    for (const tab of TABS) {
      push.mockClear();
      const { unmount } = render(<DemoApp initialTab={null} />);
      fireEvent.click(screen.getByRole("button", { name: `Try it ${panelTitle(tab)}` }));
      expect(push).toHaveBeenCalledWith(`/?tab=${tab}`);
      expect(screen.queryByTestId("intro")).toBeNull();
      expect(screen.getByTestId(`tab-${tab}`).getAttribute("aria-selected")).toBe("true");
      expect(screen.getByRole("heading", { level: 2, name: PANEL_HEADING[tab] })).toBeTruthy();
      for (const other of TABS) {
        if (other === tab) continue;
        expect(screen.getByTestId(`tab-${other}`).getAttribute("aria-selected")).toBe("false");
      }
      unmount();
    }
  });

  test("Start demo opens the phishing tab and Overview returns to the intro", () => {
    render(<DemoApp initialTab={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start demo" }));
    expect(push).toHaveBeenCalledWith("/?tab=phishing");
    expect(screen.getByTestId("tab-phishing").getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByTestId("tab-dlp"));
    expect(replace).toHaveBeenCalledWith("/?tab=dlp", { scroll: false });
    expect(screen.getByTestId("tab-dlp").getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("link", { name: "Overview" }));
    expect(push).toHaveBeenCalledWith("/");
    expect(screen.getByTestId("intro")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: /Microsoft Decision-1/ })).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  test("opens a tab directly when sign-in returns to /?tab=", () => {
    render(<DemoApp initialTab="mcp" />);
    expect(screen.queryByTestId("intro")).toBeNull();
    expect(screen.getByTestId("tab-mcp").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("href")).toBe("/");
  });

  test("keeps the mock-data banner visible with the intro", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "1");
    render(
      <>
        <MockDataBanner />
        <DemoApp initialTab={null} />
      </>,
    );
    expect(screen.getByTestId("mock-data-banner").textContent).toBe(
      "Mock data — not real Decision-1 verdicts",
    );
    expect(screen.getByTestId("intro")).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(5);
  });
});

function textOf(testId: string): string {
  return screen.getByTestId(testId).textContent ?? "";
}

function panelTitle(tab: Tab): string {
  return INTRO_USE_CASES.find((useCase) => useCase.id === tab)?.title ?? tab;
}
