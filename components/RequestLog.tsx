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
    <aside className="rounded-xl border border-white/10 bg-[#10192b] p-4" aria-label="Request log">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Request log</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            This list stays in memory for the current visit. It records the tab, decision,
            confidence, latency, and request ID only.
          </p>
        </div>
        <button
          type="button"
          onClick={demo.clearLog}
          className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          Clear
        </button>
      </div>
      {demo.entries.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No decisions yet in this session.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
            <caption className="sr-only">Session request log</caption>
            <thead className="text-xs tracking-wide text-slate-400 uppercase">
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
                <tr key={entry.localId} className="border-t border-white/10 align-top">
                  <td className="py-2 pr-3 text-slate-100">{entry.tab}</td>
                  <td className="py-2 pr-3 text-slate-100">{entry.decision}</td>
                  <td className="py-2 pr-3 font-mono text-slate-200">
                    {formatConfidence(entry.confidence)}
                  </td>
                  <td className="py-2 pr-3 font-mono text-slate-200">
                    {formatLatency(entry.latencyMs)}
                  </td>
                  <td className="py-2 font-mono text-xs break-all text-slate-300">
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
