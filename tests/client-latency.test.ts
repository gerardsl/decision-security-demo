import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { arenaRoundResponseSchema, decideResponseSchema } from "@/lib/contract";
import { submitDecide } from "@/lib/api-client";
import { interpretDecide } from "@/lib/interpret";
import { formatLatencyCell, formatModelCell, readModelTiming, roundTripMs } from "@/lib/latency";
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

function sourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      files.push(...sourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) files.push(full);
  }
  return files;
}

describe("client model latency", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads top-level modelMs only and keeps an explicit null", () => {
    expect(readModelTiming({ modelMs: 40, modelStatus: "ok" })).toEqual({
      modelMs: 40,
      modelStatus: "ok",
    });
    expect(readModelTiming({ modelMs: null, modelStatus: "ok" })).toEqual({
      modelMs: null,
      modelStatus: "ok",
    });
    expect(readModelTiming({ modelMs: null, modelStatus: "timeout" }).modelMs).toBeNull();
    expect(readModelTiming({ modelStatus: "ok" }).modelMs).toBeNull();
    expect(readModelTiming({ modelMs: -5, modelStatus: "ok" }).modelMs).toBeNull();
    expect(readModelTiming({ modelMs: "40", modelStatus: "ok" }).modelMs).toBeNull();
    expect(readModelTiming({ verdict: { modelMs: 33, modelStatus: "ok" } })).toEqual({
      modelMs: null,
      modelStatus: null,
    });
    expect(readModelTiming({ modelMs: 8, modelStatus: "ok", verdict: { modelMs: 99 } }).modelMs).toBe(8);
  });

  it("shows unavailable for null model time and never substitutes 0", () => {
    expect(formatModelCell(null, "ok", 180)).toBe("unavailable");
    expect(formatModelCell(null, null, 180)).toBe("unavailable");
    expect(formatLatencyCell(null)).toBe("unavailable");
    expect(formatModelCell(null, null, 180)).not.toBe("0 ms");
    expect(formatModelCell(null, null, 180)).not.toContain("0");
  });

  it("shows unavailable when no model fetch was attempted", () => {
    expect(readModelTiming({ modelMs: null, modelStatus: null })).toEqual({
      modelMs: null,
      modelStatus: null,
    });
    expect(formatModelCell(null, null, 210)).toBe("unavailable");
    expect(formatModelCell(null, null, 210)).not.toBe("0");
    expect(formatModelCell(null, null, 210)).not.toBe("0 ms");
  });

  it("shows unavailable when status is not ok even if a number is returned", () => {
    expect(formatModelCell(40, "timeout", 180)).toBe("unavailable (timeout)");
    expect(formatModelCell(40, "error", 180)).toBe("unavailable (error)");
    expect(formatModelCell(40, "timeout", 10)).not.toContain("40");
    expect(formatModelCell(12, null, 180)).toBe("unavailable");
    expect(formatModelCell(12, "other", 180)).toBe("unavailable");
  });

  it("shows the real model time when it exceeds total and warns with both values", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(formatModelCell(40, "ok", 180)).toBe("40 ms");
    expect(warn).not.toHaveBeenCalled();

    expect(formatModelCell(9_000, "ok", 180)).toBe("9,000 ms");
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain("9000");
    expect(message).toContain("180");
    expect(formatModelCell(9_000, "timeout", 180)).toBe("unavailable (timeout)");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(roundTripMs(1_000, 1_180)).toBe(180);
  });

  it("does not read the retired fallback field", () => {
    const retired = ["model", "Latency", "Ms"].join("");
    expect(readModelTiming({ [retired]: 55, modelStatus: "ok" })).toEqual({
      modelMs: null,
      modelStatus: "ok",
    });
    expect(readModelTiming({ modelMs: null, [retired]: 18, modelStatus: "ok" }).modelMs).toBeNull();

    const roots = ["app", "components", "lib"];
    const offenders = roots
      .flatMap((root) => sourceFiles(path.join(process.cwd(), root)))
      .filter((file) => readFileSync(file, "utf8").includes(retired));
    expect(offenders).toEqual([]);
  });

  it("returns model timing from /api/decide without dropping the contract fields", async () => {
    const body = { ...verdict(), modelMs: 40, modelStatus: "ok" as const };
    expect(decideResponseSchema.safeParse(body).success).toBe(true);

    fetchMock.mockResolvedValue(jsonResponse(body));
    const result = await submitDecide(phishing, "nominal");

    expect(fetchMock).toHaveBeenCalledWith("/api/decide", expect.objectContaining({ method: "POST" }));
    expect(result.ok).toBe(true);
    expect(result.modelMs).toBe(40);
    expect(result.modelStatus).toBe("ok");
    if (!result.ok) return;
    expect(result.data.latencyMs).toBe(body.latencyMs);
    expect(result.data.modelMs).toBe(40);
    expect(result.data.modelStatus).toBe("ok");
  });

  it("reports a timeout status without changing the outcome", async () => {
    const body = verdict({
      outcome: "undecided",
      reason: "timeout",
      confidence: 0,
      modelMs: null,
      modelStatus: "timeout",
    });
    fetchMock.mockResolvedValue(jsonResponse(body, 502));
    const result = await submitDecide(phishing, "nominal");

    expect(result.ok).toBe(false);
    expect(result.modelMs).toBeNull();
    expect(result.modelStatus).toBe("timeout");
    expect(formatModelCell(result.modelMs ?? null, result.modelStatus ?? null, 95)).toBe(
      "unavailable (timeout)",
    );
    if (result.ok || result.fault.kind !== "http") throw new Error("expected http fault");
    expect(decideResponseSchema.safeParse(result.fault.body).success).toBe(true);
    const view = interpretDecide("phishing", result);
    expect(view.kind).toBe("verdict");
    if (view.kind !== "verdict") return;
    expect(view.reason).toBe("timeout");
    expect(view.headline).toBe("Undecided");
  });

  it("shows unavailable when the response never attempted a model fetch", async () => {
    const body = verdict({
      outcome: "block",
      reason: "invalid_tool_name",
      confidence: 0,
      modelMs: null,
      modelStatus: null,
    });
    expect(decideResponseSchema.safeParse(body).success).toBe(true);
    fetchMock.mockResolvedValue(jsonResponse(body, 502));
    const result = await submitDecide(
      { tab: "mcp", input: { toolName: "send", args: {}, agentContext: "demo" } },
      "nominal",
    );
    expect(result.modelMs).toBeNull();
    expect(result.modelStatus).toBeNull();
    expect(formatModelCell(result.modelMs ?? null, result.modelStatus ?? null, 40)).toBe("unavailable");
  });

  it("leaves arena timing on the verdict and does not read it as the top-level decide body", () => {
    const arena = {
      attack: { prompt: "Hello" },
      verdict: { ...verdict(), modelMs: 14, modelStatus: "ok" as const },
      round: 1,
    };
    expect(readModelTiming(arena)).toEqual({ modelMs: null, modelStatus: null });
    expect(arenaRoundResponseSchema.safeParse(arena).success).toBe(true);
  });
});
