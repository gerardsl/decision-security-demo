export type ClientFault =
  | { kind: "timeout" }
  | { kind: "network" }
  | { kind: "http"; status: number; body: unknown };

export type TransportResult<T> =
  | { ok: true; data: T }
  | { ok: false; fault: ClientFault };
