/**
 * Request-log timings measured in the browser.
 *
 * Total is the click-to-parsed-response round trip. Model time is copied from
 * the decide payload: `modelMs` when that field is a usable number, otherwise
 * `modelLatencyMs`. Missing or null model time stays null so the table can
 * show "unavailable" instead of 0.
 */

export type ClientTiming = {
  totalMs: number | null;
  modelMs: number | null;
};

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A usable duration. Null, missing, and non-numbers stay null — never coerced to 0. */
export function finiteLatencyMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function timingSource(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body)) return null;
  if ("modelMs" in body || "modelLatencyMs" in body) return body;
  if (isRecord(body.verdict)) return body.verdict;
  return null;
}

/**
 * Prefer `modelMs`. Fall back to `modelLatencyMs` when the preferred field
 * is missing, null, or not a usable number. Arena payloads nest the decide
 * body on `verdict`.
 */
export function readModelLatencyMs(body: unknown): number | null {
  const record = timingSource(body);
  if (!record) return null;
  if ("modelMs" in record) {
    const preferred = finiteLatencyMs(record.modelMs);
    if (preferred !== null) return preferred;
  }
  if ("modelLatencyMs" in record) return finiteLatencyMs(record.modelLatencyMs);
  return null;
}

/** Drop timing fields so the strict decide schema still accepts the rest of the body. */
export function stripModelTimingFields(body: unknown): unknown {
  if (!isRecord(body)) return body;
  const next: Record<string, unknown> = { ...body };
  delete next.modelMs;
  delete next.modelLatencyMs;
  if (isRecord(next.verdict)) {
    const verdict: Record<string, unknown> = { ...next.verdict };
    delete verdict.modelMs;
    delete verdict.modelLatencyMs;
    next.verdict = verdict;
  }
  return next;
}

/** Elapsed time from a `performance.now()` mark taken at the click. */
export function roundTripMs(startedAt: number, finishedAt = performance.now()): number {
  const elapsed = finishedAt - startedAt;
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  return elapsed;
}

/**
 * Model time shown in the table. Never larger than Total when both are known.
 * Null stays null so the cell reads "unavailable".
 */
export function presentedModelMs(modelMs: number | null, totalMs: number | null): number | null {
  const model = finiteLatencyMs(modelMs);
  if (model === null) return null;
  const total = finiteLatencyMs(totalMs);
  if (total !== null && model > total) return total;
  return model;
}

export function formatLatencyCell(value: number | null): string {
  const timing = finiteLatencyMs(value);
  if (timing === null) return "unavailable";
  return `${numberFormat.format(timing)} ms`;
}
