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

function decision(): DecideResponse {
  return decideResponseSchema.parse({
    decision: { type: "yesno", value: true },
    confidence: 0.91,
    rationale: "Synthetic.",
    outcome: "allow",
    reason: "ok",
    latencyMs: 12,
    modelMs: null,
    modelStatus: null,
    requestId: REQUEST_ID,
  });
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

  test("shows the real Decision-1 model time when it exceeds total, and warns with both values", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const clock = installClock(180);
    submitDecide.mockImplementation(async () => {
      clock.finish();
      return { ok: true, data: decision(), modelMs: 42, modelStatus: "ok" };
    });

    renderLog();
    fireEvent.click(screen.getByTestId("submit-decision"));

    await waitFor(() => {
      expect(log().getByTestId("latency-total").textContent).toBe("180 ms");
    });
    expect(log().getByRole("columnheader", { name: "Total" })).toBeTruthy();
    expect(log().getByRole("columnheader", { name: "Model (Decision-1)" })).toBeTruthy();
    expect(log().getByTestId("latency-model").textContent).toBe("42 ms");
    expect(warn).not.toHaveBeenCalled();

    clock.reset();
    submitDecide.mockImplementation(async () => {
      clock.finish();
      return { ok: true, data: decision(), modelMs: 9_000, modelStatus: "ok" };
    });
    fireEvent.click(screen.getByTestId("submit-decision"));

    await waitFor(() => {
      expect(log().getAllByTestId("latency-model")).toHaveLength(2);
    });
    const [latestModel, earlierModel] = log().getAllByTestId("latency-model");
    const [latestTotal] = log().getAllByTestId("latency-total");
    expect(latestTotal?.textContent).toBe("180 ms");
    expect(latestModel?.textContent).toBe("9,000 ms");
    expect(earlierModel?.textContent).toBe("42 ms");
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain("9000");
    expect(message).toContain("180");
  });

  test("shows unavailable for null model time and for a non-ok status that still includes a number", async () => {
    const clock = installClock(95);
    submitDecide.mockImplementation(async () => {
      clock.finish();
      return { ok: true, data: decision(), modelMs: null, modelStatus: null };
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
      return { ok: true, data: decision(), modelMs: 50, modelStatus: "timeout" };
    });
    fireEvent.click(screen.getByTestId("submit-decision"));

    await waitFor(() => {
      expect(log().getAllByTestId("latency-model")[0]?.textContent).toBe("unavailable (timeout)");
    });

    clock.reset();
    submitDecide.mockImplementation(async () => {
      clock.finish();
      return { ok: true, data: decision(), modelMs: 50, modelStatus: "error" };
    });
    fireEvent.click(screen.getByTestId("submit-decision"));

    await waitFor(() => {
      expect(log().getAllByTestId("latency-model")[0]?.textContent).toBe("unavailable (error)");
    });

    for (const cell of log().getAllByTestId("latency-model")) {
      expect(cell.textContent?.startsWith("unavailable")).toBe(true);
      expect(cell.textContent).not.toBe("0");
      expect(cell.textContent).not.toBe("0 ms");
      expect(cell.textContent).not.toContain("50");
    }
  });
});
