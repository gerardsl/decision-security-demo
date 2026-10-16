import type { ModelStatus } from "@/lib/contract";

/**
 * In-process mark for a Decision-1 body this server has already timed.
 * JSON from the model cannot carry the symbol, so a response payload is never
 * mistaken for a timing envelope.
 */
export const MODEL_CALL = Symbol.for("decision-security-demo.model-call");

export type ModelTiming = {
  modelMs: number | null;
  modelStatus: ModelStatus | null;
};

export const NO_MODEL_TIMING: ModelTiming = { modelMs: null, modelStatus: null };

export type TimedModelBody = {
  readonly [MODEL_CALL]: true;
  body: unknown;
  modelMs: number;
  modelStatus: "ok";
};

export function integerMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

export function timedModelBody(body: unknown, modelMs: number): TimedModelBody {
  return {
    [MODEL_CALL]: true,
    body,
    modelMs: integerMs(modelMs) ?? 0,
    modelStatus: "ok",
  };
}

export function readTimedModelBody(value: unknown): { body: unknown; timing: ModelTiming } | null {
  if (typeof value !== "object" || value === null || !(MODEL_CALL in value)) return null;
  const record = value as Partial<TimedModelBody>;
  if (record[MODEL_CALL] !== true || record.modelStatus !== "ok") return null;
  const modelMs = integerMs(record.modelMs);
  if (modelMs === null) return null;
  return { body: record.body, timing: { modelMs, modelStatus: "ok" } };
}

/** Header for a successful model fetch. The browser measures total. */
export function modelServerTiming(modelMs: number): string {
  return `model;dur=${modelMs}`;
}

/** Present only when the model call succeeded. Error and timeout responses omit it. */
export function modelTimingHeaders(timing: ModelTiming): { "Server-Timing": string } | undefined {
  if (timing.modelStatus !== "ok" || timing.modelMs === null || !Number.isFinite(timing.modelMs)) return undefined;
  return { "Server-Timing": modelServerTiming(timing.modelMs) };
}
