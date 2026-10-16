import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { DecisionCard } from "@/components/DecisionCard";
import { decideResponseSchema, type DecideResponse } from "@/lib/contract";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

function response(
  partial: Omit<DecideResponse, "modelMs" | "modelStatus"> &
    Partial<Pick<DecideResponse, "modelMs" | "modelStatus">>,
): DecideResponse {
  return decideResponseSchema.parse({
    modelMs: 1,
    modelStatus: "ok",
    ...partial,
  });
}

describe("DecisionCard", () => {
  test("shows a yes/no badge, rationale, latency, and request id", () => {
    render(
      <DecisionCard
        tab="phishing"
        response={response({
          decision: { type: "yesno", value: true },
          confidence: 0.91,
          rationale: "Synthetic rationale for the payroll lure.",
          outcome: "allow",
          reason: "ok",
          latencyMs: 128,
          requestId: REQUEST_ID,
        })}
      />,
    );

    expect(screen.getByTestId("yesno-badge").textContent).toContain("Yes");
    expect(screen.getByText("Phishing")).toBeTruthy();
    expect(screen.getByText("Synthetic rationale for the payroll lure.")).toBeTruthy();
    expect(screen.getByText("128 ms")).toBeTruthy();
    expect(screen.getByText(REQUEST_ID)).toBeTruthy();
    expect(screen.getByTestId("confidence-caption").textContent).toBe(
      "Model-reported confidence, not a calibrated probability",
    );
  });

  test("lists every choice and marks the chosen option", () => {
    render(
      <DecisionCard
        tab="soc"
        response={response({
          decision: {
            type: "choice",
            value: "suspicious",
            options: [
              { label: "benign", score: 0.1 },
              { label: "suspicious", score: 0.7 },
              { label: "malicious", score: 0.2 },
            ],
            probabilities: { benign: 0.1, suspicious: 0.7, malicious: 0.2 },
          },
          confidence: 0.8,
          rationale: "Needs a person.",
          outcome: "allow",
          reason: "ok",
          latencyMs: 90,
          requestId: REQUEST_ID,
        })}
      />,
    );

    const options = screen.getByTestId("choice-options");
    expect(options.textContent).toContain("benign");
    expect(options.textContent).toContain("suspicious");
    expect(options.textContent).toContain("malicious");
    const chosen = options.querySelector('[data-chosen="true"]');
    expect(chosen?.textContent).toContain("suspicious");
    expect(chosen?.textContent).toContain("Chosen");
    expect(chosen?.textContent).toContain("p 0.7");
    expect(options.querySelectorAll("li")).toHaveLength(3);
  });

  test("draws a score bar from min to max", () => {
    render(
      <DecisionCard
        tab="dlp"
        response={response({
          decision: { type: "score", value: 3, min: 0, max: 4, probabilities: {} },
          confidence: 0.88,
          outcome: "block",
          reason: "score_threshold",
          latencyMs: 40,
          requestId: REQUEST_ID,
        })}
      />,
    );

    const meter = screen.getByTestId("score-meter");
    expect(meter.getAttribute("aria-valuemin")).toBe("0");
    expect(meter.getAttribute("aria-valuemax")).toBe("4");
    expect(meter.getAttribute("aria-valuenow")).toBe("3");
    expect(meter.getAttribute("data-score-pct")).toBe(String(((3 - 0) / 4) * 100));
    expect(screen.getByText("Score 3 · high")).toBeTruthy();
    expect(screen.getByText("No rationale was returned.")).toBeTruthy();
    expect(screen.queryByTestId("score-distribution")).toBeNull();
  });

  test("places a fractional score of 2.97 without rounding", () => {
    const value = 2.97;
    const pct = ((value - 0) / 4) * 100;
    render(
      <DecisionCard
        tab="dlp"
        response={response({
          decision: {
            type: "score",
            value,
            min: 0,
            max: 4,
            probabilities: { 0: 0.01, 1: 0.04, 2: 0.15, 3: 0.7, 4: 0.1 },
          },
          confidence: 0.93,
          outcome: "block",
          reason: "score_threshold",
          latencyMs: 33,
          requestId: REQUEST_ID,
        })}
      />,
    );

    const meter = screen.getByTestId("score-meter");
    expect(meter.getAttribute("aria-valuenow")).toBe("2.97");
    expect(meter.getAttribute("data-score-pct")).toBe(String(pct));
    expect(screen.getByTestId("score-value").textContent).toBe("Score 2.97");
    expect(screen.getByTestId("score-value").textContent).not.toContain("high");
    const distribution = screen.getByTestId("score-distribution");
    expect(distribution.querySelector('[data-level="3"]')?.getAttribute("data-probability")).toBe("0.7");
    expect(distribution.querySelector('[data-level="2"]')?.getAttribute("style")).toContain("height:");
  });

  test("renders model text as text, including markup characters", () => {
    const { container } = render(
      <DecisionCard
        tab="arena"
        response={response({
          decision: { type: "yesno", value: false },
          confidence: 0.77,
          rationale: '<script>alert("x")</script><img src=x onerror=alert(1)>',
          outcome: "block",
          reason: "policy_unsafe",
          latencyMs: 10,
          requestId: REQUEST_ID,
        })}
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText('<script>alert("x")</script><img src=x onerror=alert(1)>')).toBeTruthy();
  });
});
