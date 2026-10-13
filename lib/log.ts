export type DecisionLog = {
  requestId: string;
  tab?: string;
  latencyMs?: number;
  decision?: string;
  status?: string;
};

const FIELDS = ["requestId", "tab", "latencyMs", "decision", "status"] as const;

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
