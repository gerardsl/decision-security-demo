import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DemoProvider } from "@/components/demo-context";
import { PhishingPanel } from "@/components/panels";
import { RequestLog } from "@/components/RequestLog";
import { decideResponseSchema, type DecideResponse } from "@/lib/contract";

const { submitDecide } = vi.hoisted(() => ({
  submitDecide: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/api-client", () => ({
  submitDecide,
}));

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";

function decision(modelMs?: number | null): DecideResponse & { modelMs?: number | null } {
  return {
    ...decideResponseSchema.parse({
      decision: { type: "yesno", value: true },
      confidence: 0.91,
      rationale: "Synthetic.",
      outcome: "allow",
      reason: "ok",
      latencyMs: 12,
      requestId: REQUEST_ID,
    }),
    modelMs,
  };
}

function installClock(deltaMs: number) {
  let phase: "click" | "done" = "click";
  vi.spyOn(performance, "now").mockImplementation(() => (phase === "click" ? 1_000 : 1_000 + deltaMs));
  return {
    finish() {
      phase = "done";
    },
    reset() {
      phase = "click";
    },
  };
}

function renderLog() {
  render(
    <DemoProvider>
      <PhishingPanel />
      <RequestLog />
    </DemoProvider>,
  );
}

function log() {
  return within(screen.getByRole("complementary", { name: "Request log" }));
}

describe("latency table", () => {
  afterEach(() => {
    submitDecide.mockReset();
    vi.restoreAllMocks();
  });

  test("shows browser total and Decision-1 model time, capped by total", async () => {
    const clock = installClock(180);
    submitDecide.mockImplementation(async () => {
      clock.finish();
      return { ok: true, data: decision(), modelMs: 42 };
    });

    renderLog();
    fireEvent.click(screen.getByTestId("submit-decision"));

    await waitFor(() => {
      expect(log().getByTestId("latency-total").textContent).toBe("180 ms");
    });
    expect(log().getByRole("columnheader", { name: "Total" })).toBeTruthy();
    expect(log().getByRole("columnheader", { name: "Model (Decision-1)" })).toBeTruthy();
    expect(log().getByTestId("latency-model").textContent).toBe("42 ms");
    expect(log().getByTestId("latency-model").textContent).not.toBe("0 ms");

    clock.reset();
    submitDecide.mockImplementation(async () => {
      clock.finish();
      return { ok: true, data: decision(), modelMs: 9_000 };
    });
    fireEvent.click(screen.getByTestId("submit-decision"));

    await waitFor(() => {
      expect(log().getAllByTestId("latency-model")).toHaveLength(2);
    });
    const [latestModel, earlierModel] = log().getAllByTestId("latency-model");
    const [latestTotal] = log().getAllByTestId("latency-total");
    expect(latestTotal?.textContent).toBe("180 ms");
    expect(latestModel?.textContent).toBe("180 ms");
    expect(latestModel?.textContent).not.toContain("9,000");
    expect(latestModel?.textContent).not.toContain("9000");
    expect(earlierModel?.textContent).toBe("42 ms");
  });

  test("shows unavailable when model time is null or missing, never 0", async () => {
    const clock = installClock(95);
    submitDecide.mockImplementation(async () => {
      clock.finish();
      return { ok: true, data: decision(), modelMs: null };
    });

    renderLog();
    fireEvent.click(screen.getByTestId("submit-decision"));

    await waitFor(() => {
      expect(log().getByTestId("latency-model").textContent).toBe("unavailable");
    });
    expect(log().getByTestId("latency-total").textContent).toBe("95 ms");
    expect(log().getByTestId("latency-model").textContent).not.toContain("0");

    clock.reset();
    submitDecide.mockImplementation(async () => {
      clock.finish();
      return { ok: true, data: decision() };
    });
    fireEvent.click(screen.getByTestId("submit-decision"));

    await waitFor(() => {
      expect(log().getAllByTestId("latency-model")).toHaveLength(2);
    });
    for (const cell of log().getAllByTestId("latency-model")) {
      expect(cell.textContent).toBe("unavailable");
      expect(cell.textContent).not.toBe("0");
      expect(cell.textContent).not.toBe("0 ms");
    }
  });
});
