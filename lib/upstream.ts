import "server-only";
import { ClientSecretCredential } from "@azure/identity";
export const DECISION_ENDPOINT =
  "https://decision-gerards-resource.services.ai.azure.com/providers/microsoft/v1/systemone";
export const AZURE_TENANT_ID = "ad2e140d-9fac-4f68-9aee-70fac41f2ee7";
export const AZURE_CLIENT_ID = "2192e580-1cd5-4d11-978a-e668270f3f04";
export const AZURE_SCOPE = "https://cognitiveservices.azure.com/.default";
export const UPSTREAM_TIMEOUT_MS = 8_000;

export class DecisionCallError extends Error {
  readonly reason: "timeout" | "upstream";

  constructor(reason: "timeout" | "upstream") {
    super(reason);
    this.name = "DecisionCallError";
    this.reason = reason;
  }
}

export type TokenProvider = () => Promise<string>;

let cachedCredential: ClientSecretCredential | undefined;
let cachedSecret: string | undefined;

function credential(): ClientSecretCredential {
  const secret = process.env.AZURE_CLIENT_SECRET;
  if (!secret) throw new DecisionCallError("upstream");
  if (!cachedCredential || cachedSecret !== secret) {
    cachedCredential = new ClientSecretCredential(AZURE_TENANT_ID, AZURE_CLIENT_ID, secret);
    cachedSecret = secret;
  }
  return cachedCredential;
}

export function createDecisionCaller(options?: {
  fetchImpl?: typeof fetch;
  tokenProvider?: TokenProvider;
  timeoutMs?: number;
  endpoint?: string;
}) {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const endpoint = options?.endpoint ?? DECISION_ENDPOINT;
  const tokenProvider =
    options?.tokenProvider ??
    (async () => {
      try {
        const token = await credential().getToken(AZURE_SCOPE);
        if (!token?.token) throw new DecisionCallError("upstream");
        return token.token;
      } catch (error) {
        if (error instanceof DecisionCallError) throw error;
        throw new DecisionCallError("upstream");
      }
    });

  return async function callDecision(body: unknown): Promise<unknown> {
    let token: string;
    try {
      token = await tokenProvider();
    } catch (error) {
      if (error instanceof DecisionCallError) throw error;
      throw new DecisionCallError("upstream");
    }
    const timeout = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: timeout,
      });
    } catch (error) {
      if (isTimeout(error)) throw new DecisionCallError("timeout");
      throw new DecisionCallError("upstream");
    }
    if (!response.ok) throw new DecisionCallError("upstream");
    try {
      return await response.json();
    } catch {
      throw new DecisionCallError("upstream");
    }
  };
}

function isTimeout(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) return false;
  const name = String(error.name);
  return name === "TimeoutError" || name === "AbortError";
}
