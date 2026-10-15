"use client";

import { useDemo } from "@/components/demo-context";

function formatConfidence(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatLatency(value: number | null): string {
  if (value === null) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)} ms`;
}

export function RequestLog() {
  const demo = useDemo();

  return (
    <aside className="surface-card p-5 sm:p-6" aria-label="Request log">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="title">Request log</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            This list stays in memory for the current visit. It records the tab, decision,
            confidence, latency, and request ID only.
          </p>
        </div>
        <button type="button" onClick={demo.clearLog} className="btn-outline shrink-0">
          Clear
        </button>
      </div>
      {demo.entries.length === 0 ? (
        <p className="lede mt-5">No decisions yet in this session.</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
            <caption className="sr-only">Session request log</caption>
            <thead className="text-xs tracking-[0.08em] text-muted uppercase">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Tab
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Decision
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Confidence
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Latency
                </th>
                <th scope="col" className="py-2 font-medium">
                  Request ID
                </th>
              </tr>
            </thead>
            <tbody>
              {demo.entries.map((entry) => (
                <tr key={entry.localId} className="border-t border-hairline align-top">
                  <td className="py-2 pr-3 text-ink">{entry.tab}</td>
                  <td className="py-2 pr-3 text-ink">{entry.decision}</td>
                  <td className="py-2 pr-3 font-mono text-body">
                    {formatConfidence(entry.confidence)}
                  </td>
                  <td className="py-2 pr-3 font-mono text-body">
                    {formatLatency(entry.latencyMs)}
                  </td>
                  <td className="py-2 font-mono text-xs break-all text-muted">
                    {entry.requestId ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </aside>
  );
}
