/**
 * Request-log timings measured in the browser.
 *
 * Total is the click-to-parsed-response round trip. Model time comes only from
 * the top-level `modelMs` field, and only when `modelStatus` is "ok".
 * A null `modelMs` stays null. The shown model time is the real `modelMs`,
 * even when it is larger than Total. A console warning records both numbers
 * in that case.
 */

export type ClientTiming = {
  totalMs: number | null;
  modelMs: number | null;
  modelStatus: string | null;
};

export type ModelTiming = {
  modelMs: number | null;
  modelStatus: string | null;
};

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const EMPTY_TIMING: ModelTiming = { modelMs: null, modelStatus: null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A usable duration. Null, missing, and non-numbers stay null — never coerced to 0. */
export function finiteLatencyMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

/** Top-level decide fields only. Nested verdict timing is ignored. */
export function readModelTiming(body: unknown): ModelTiming {
  if (!isRecord(body)) return EMPTY_TIMING;
  const modelStatus = typeof body.modelStatus === "string" ? body.modelStatus : null;
  const modelMs = Object.hasOwn(body, "modelMs") ? finiteLatencyMs(body.modelMs) : null;
  return { modelMs, modelStatus };
}

function omitTimingKeys(record: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...record };
  delete next.modelMs;
  delete next.modelStatus;
  return next;
}

/** Drop timing fields so the strict decide schema still accepts the rest of the body. */
export function stripModelTimingFields(body: unknown): unknown {
  if (!isRecord(body)) return body;
  const next = omitTimingKeys(body);
  if (isRecord(next.verdict)) next.verdict = omitTimingKeys(next.verdict);
  return next;
}

/** Elapsed time from a `performance.now()` mark taken at the click. */
export function roundTripMs(startedAt: number, finishedAt = performance.now()): number {
  const elapsed = finishedAt - startedAt;
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  return elapsed;
}

export function formatLatencyCell(value: number | null): string {
  const timing = finiteLatencyMs(value);
  if (timing === null) return "unavailable";
  return `${numberFormat.format(timing)} ms`;
}

/**
 * Model column text. A number is shown only for status "ok" and a finite
 * modelMs >= 0. The displayed value is that real modelMs, including when it
 * exceeds Total. The console records both numbers in that case.
 */
export function formatModelCell(
  modelMs: number | null,
  modelStatus: string | null,
  totalMs: number | null,
): string {
  if (modelStatus === "error" || modelStatus === "timeout") {
    return `unavailable (${modelStatus})`;
  }
  if (modelStatus !== "ok") return "unavailable";
  const model = finiteLatencyMs(modelMs);
  if (model === null) return "unavailable";
  const total = finiteLatencyMs(totalMs);
  if (total !== null && model > total) {
    console.warn(
      `Decision-1 model latency ${model} ms exceeds total round trip ${total} ms.`,
    );
  }
  return formatLatencyCell(model);
}
