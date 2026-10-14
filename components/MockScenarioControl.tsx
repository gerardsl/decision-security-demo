"use client";

import { MOCK_SCENARIOS, MOCK_SCENARIO_LABELS } from "@/lib/mock-api";
import { isMockScenario, useDemo } from "@/components/demo-context";

export function MockScenarioControl() {
  const demo = useDemo();
  if (!demo.mock) return null;

  return (
    <label className="flex flex-col gap-1 text-xs text-slate-300">
      Mock scenario
      <select
        value={demo.scenario}
        onChange={(event) => {
          if (isMockScenario(event.target.value)) demo.setScenario(event.target.value);
        }}
        className="rounded-md border border-amber-300/40 bg-[#1a1408] px-2 py-1.5 text-sm text-amber-50 outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
      >
        {MOCK_SCENARIOS.map((scenario) => (
          <option key={scenario} value={scenario}>
            {MOCK_SCENARIO_LABELS[scenario]}
          </option>
        ))}
      </select>
    </label>
  );
}
