import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { arenaRoundResponseSchema, decideResponseSchema } from "@/lib/contract";
import { submitDecide } from "@/lib/api-client";
import { interpretDecide } from "@/lib/interpret";
import {
  formatLatencyCell,
  presentedModelMs,
  readModelLatencyMs,
  roundTripMs,
  stripModelTimingFields,
} from "@/lib/latency";
import { verdict } from "@/tests/helpers";

const fetchMock = vi.fn();

const phishing = {
  tab: "phishing" as const,
  input: { sender: "a@b.co", subject: "Hello", body: "A note" },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("client model latency", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers modelMs and falls back to modelLatencyMs", () => {
    expect(readModelLatencyMs({ modelMs: 40, modelLatencyMs: 90 })).toBe(40);
    expect(readModelLatencyMs({ modelLatencyMs: 55 })).toBe(55);
    expect(readModelLatencyMs({ modelMs: null, modelLatencyMs: 18 })).toBe(18);
    expect(readModelLatencyMs({ modelMs: "40", modelLatencyMs: 15 })).toBe(15);
    expect(readModelLatencyMs({ verdict: { modelMs: 33 } })).toBe(33);
    expect(readModelLatencyMs({ verdict: { modelLatencyMs: 21 } })).toBe(21);
    expect(readModelLatencyMs({ modelMs: 8, verdict: { modelMs: 99 } })).toBe(8);
  });

  it("treats a missing or null model time as unavailable, never 0", () => {
    expect(readModelLatencyMs(verdict())).toBeNull();
    expect(readModelLatencyMs({ modelMs: null })).toBeNull();
    expect(readModelLatencyMs({ modelLatencyMs: null })).toBeNull();
    expect(readModelLatencyMs({ modelMs: null, modelLatencyMs: null })).toBeNull();
    expect(readModelLatencyMs({ modelMs: -5 })).toBeNull();
    expect(formatLatencyCell(null)).toBe("unavailable");
    expect(formatLatencyCell(readModelLatencyMs({ modelMs: null }))).not.toBe("0 ms");
    expect(formatLatencyCell(readModelLatencyMs({}))).not.toContain("0");
  });

  it("never presents model time larger than total", () => {
    expect(presentedModelMs(40, 180)).toBe(40);
    expect(presentedModelMs(9_000, 180)).toBe(180);
    expect(presentedModelMs(null, 180)).toBeNull();
    expect(formatLatencyCell(presentedModelMs(9_000, 180))).toBe("180 ms");
    expect(formatLatencyCell(presentedModelMs(null, 180))).toBe("unavailable");
    expect(roundTripMs(1_000, 1_180)).toBe(180);
  });

  it("keeps the strict decide schema and still returns modelMs from /api/decide", async () => {
    const body = { ...verdict(), modelMs: 40, modelLatencyMs: 90 };
    expect(decideResponseSchema.safeParse(body).success).toBe(false);
    expect(decideResponseSchema.safeParse(stripModelTimingFields(body)).success).toBe(true);

    fetchMock.mockResolvedValue(jsonResponse(body));
    const result = await submitDecide(phishing, "nominal");

    expect(fetchMock).toHaveBeenCalledWith("/api/decide", expect.objectContaining({ method: "POST" }));
    expect(result.ok).toBe(true);
    expect(result.modelMs).toBe(40);
    if (!result.ok) return;
    expect(result.data.latencyMs).toBe(body.latencyMs);
    expect(Object.hasOwn(result.data, "modelMs")).toBe(false);
    expect(Object.hasOwn(result.data, "modelLatencyMs")).toBe(false);
  });

  it("falls back to modelLatencyMs when modelMs is absent", async () => {
    const body = { ...verdict(), modelLatencyMs: 55 };
    fetchMock.mockResolvedValue(jsonResponse(body));
    const result = await submitDecide(phishing, "nominal");
    expect(result.ok).toBe(true);
    expect(result.modelMs).toBe(55);
  });

  it("reports unavailable model time on a timeout body without changing the outcome", async () => {
    const body = {
      ...verdict({ outcome: "undecided", reason: "timeout", confidence: 0 }),
      modelMs: null,
    };
    fetchMock.mockResolvedValue(jsonResponse(body, 502));
    const result = await submitDecide(phishing, "nominal");

    expect(result.ok).toBe(false);
    expect(result.modelMs).toBeNull();
    expect(formatLatencyCell(result.modelMs ?? null)).toBe("unavailable");
    if (result.ok || result.fault.kind !== "http") throw new Error("expected http fault");
    expect(decideResponseSchema.safeParse(result.fault.body).success).toBe(true);
    const view = interpretDecide("phishing", result);
    expect(view.kind).toBe("verdict");
    if (view.kind !== "verdict") return;
    expect(view.reason).toBe("timeout");
    expect(view.headline).toBe("Undecided");
  });

  it("strips nested model timing so an arena verdict still parses", () => {
    const arena = {
      attack: { prompt: "Hello" },
      verdict: { ...verdict(), modelMs: 14 },
      round: 1,
    };
    expect(readModelLatencyMs(arena)).toBe(14);
    expect(arenaRoundResponseSchema.safeParse(arena).success).toBe(false);
    expect(arenaRoundResponseSchema.safeParse(stripModelTimingFields(arena)).success).toBe(true);
  });
});
