export type ClientFault =
  | { kind: "timeout" }
  | { kind: "network" }
  | { kind: "http"; status: number; body: unknown };

export type TransportResult<T> =
  | { ok: true; data: T; modelMs?: number | null; modelStatus?: string | null }
  | { ok: false; fault: ClientFault; modelMs?: number | null; modelStatus?: string | null };
