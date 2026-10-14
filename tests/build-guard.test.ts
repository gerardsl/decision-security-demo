import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function run(env: Record<string, string>) {
  return spawnSync("node", ["scripts/check-fault-injection.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

describe("fault injection build guard", () => {
  it("fails the build only for production with the flag enabled", () => {
    const blocked = run({ VERCEL_ENV: "production", DEMO_FAULT_INJECTION: "1" });
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain("DEMO_FAULT_INJECTION");

    expect(run({ VERCEL_ENV: "production", DEMO_FAULT_INJECTION: "0" }).status).toBe(0);
    expect(run({ VERCEL_ENV: "preview", DEMO_FAULT_INJECTION: "1" }).status).toBe(0);
    expect(run({ VERCEL_ENV: "production", DEMO_FAULT_INJECTION: "" }).status).toBe(0);
  });
});
