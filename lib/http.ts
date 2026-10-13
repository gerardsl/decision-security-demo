import { API_ERROR_STATUS, LIMITS, type ApiErrorBody, type ErrorCode } from "@/lib/contract";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly retryAfterMs?: number;

  constructor(code: ErrorCode, message: string, retryAfterMs?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = API_ERROR_STATUS[code];
    this.retryAfterMs = retryAfterMs;
  }
}

export function errorBody(requestId: string, error: ApiError): ApiErrorBody {
  return {
    error: { code: error.code, message: error.message },
    requestId,
    ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
  };
}

export function jsonError(requestId: string, error: ApiError): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (error.retryAfterMs !== undefined) {
    headers.set("retry-after", String(Math.max(1, Math.ceil(error.retryAfterMs / 1000))));
  }
  return new Response(JSON.stringify(errorBody(requestId, error)), {
    status: error.status,
    headers,
  });
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type");
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    throw new ApiError("bad_request", "Request body must be JSON.");
  }

  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const size = Number(declared);
    if (!Number.isInteger(size) || size < 0 || size > LIMITS.maxBodyBytes) {
      throw new ApiError("bad_request", "Request body is too large.");
    }
  }

  if (!request.body) {
    throw new ApiError("bad_request", "Request body is required.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > LIMITS.maxBodyBytes) {
        await reader.cancel();
        throw new ApiError("bad_request", "Request body is too large.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("bad_request", "Request body is required.");
  }

  if (total === 0) {
    throw new ApiError("bad_request", "Request body is required.");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(concatBytes(chunks));
  } catch {
    throw new ApiError("bad_request", "Request body must be JSON.");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError("bad_request", "Request body must be JSON.");
  }
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const merged = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}
