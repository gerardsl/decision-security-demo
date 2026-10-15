"use client";

import { MOCK_SCENARIOS, MOCK_SCENARIO_LABELS } from "@/lib/mock-api";
import { isMockScenario, useDemo } from "@/components/demo-context";

export function MockScenarioControl() {
  const demo = useDemo();
  if (!demo.mock) return null;

  return (
    <label className="flex flex-col gap-1.5 text-xs text-muted">
      Mock scenario
      <select
        value={demo.scenario}
        onChange={(event) => {
          if (isMockScenario(event.target.value)) demo.setScenario(event.target.value);
        }}
        className="field-control min-w-44"
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
