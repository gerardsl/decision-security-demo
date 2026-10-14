export type DecisionLog = {
  requestId: string;
  tab?: string;
  latencyMs?: number;
  outcome?: string;
  reason?: string;
  /** Decision type only: yesno, choice, or score. */
  decision?: string;
};

const FIELDS = ["requestId", "tab", "latencyMs", "outcome", "reason", "decision"] as const;

export function logDecision(
  entry: DecisionLog,
  write: (line: string) => void = (line) => {
    console.info(line);
  },
): void {
  const line: Record<string, string | number> = {};
  for (const field of FIELDS) {
    const value = entry[field];
    if (typeof value === "string" || typeof value === "number") {
      line[field] = value;
    }
  }
  write(JSON.stringify(line));
}
