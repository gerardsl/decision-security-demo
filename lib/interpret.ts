import {
  apiErrorSchema,
  decideResponseSchema,
  type Decision,
  type DecisionReason,
  type DecideResponse,
  type Outcome,
  type Tab,
} from "@/lib/contract";
import type { ClientFault, TransportResult } from "@/lib/transport";

export type HeadlineTone = "danger" | "caution" | "safe";

export type ViewModel =
  | {
      kind: "cooldown";
      retryAfterMs: number;
      message: string;
      requestId: string | null;
    }
  | {
      kind: "auth";
      message: string;
      requestId: string | null;
    }
  | {
      kind: "friendly";
      title: string;
      message: string;
      requestId: string | null;
    }
  | {
      kind: "verdict";
      headline: string;
      tone: HeadlineTone;
      reason: DecisionReason;
      message: string;
      response: DecideResponse;
      requestId: string;
    };

export function reasonLabel(reason: DecisionReason): string {
  switch (reason) {
    case "policy_unsafe":
      return "Policy: judged unsafe";
    case "low_confidence":
      return "Low confidence";
    case "timeout":
      return "Timed out";
    case "upstream_error":
      return "Upstream error";
    case "score_threshold":
      return "Score crossed the sensitivity threshold";
    case "invalid_option":
      return "Invalid option";
    case "ok":
      return "OK";
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

export function decisionSummary(decision: Decision): string {
  if (decision.type === "yesno") return decision.value ? "yes" : "no";
  if (decision.type === "choice") return decision.value;
  return `score ${decision.value}`;
}

export function verdictText(tab: Tab, decision: Decision): string {
  if (tab === "phishing" && decision.type === "yesno") {
    return decision.value ? "Phishing" : "Legitimate";
  }
  if (tab === "soc" && decision.type === "choice") {
    return titleCase(decision.value);
  }
  return decisionSummary(decision);
}

export function outcomeHeadline(tab: Tab, response: DecideResponse): string {
  if (tab === "phishing" || tab === "soc") {
    if (response.outcome === "undecided") return "Undecided";
    return verdictText(tab, response.decision);
  }
  return guardrailWord(response.outcome);
}

export function guardrailWord(outcome: Outcome): string {
  switch (outcome) {
    case "allow":
      return "Allowed";
    case "block":
      return "Blocked";
    case "undecided":
      return "Undecided";
  }
}

export function headlineTone(tab: Tab, response: DecideResponse): HeadlineTone {
  const headline = outcomeHeadline(tab, response);
  if (headline === "Undecided" || headline === "Suspicious") return "caution";
  if (headline === "Blocked" || headline === "Phishing" || headline === "Malicious") return "danger";
  return "safe";
}

export function yesNoMeaning(tab: Tab, value: boolean): string {
  if (tab === "phishing") return value ? "Phishing" : "Legitimate";
  if (tab === "mcp") return value ? "Model yes: within policy" : "Model no: outside policy";
  if (tab === "arena") return value ? "Model yes: ordinary request" : "Model no: not an ordinary request";
  return value ? "Yes" : "No";
}

function titleCase(value: string): string {
  if (value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function verdictModel(response: DecideResponse, tab: Tab, message: string): ViewModel {
  return {
    kind: "verdict",
    headline: outcomeHeadline(tab, response),
    tone: headlineTone(tab, response),
    reason: response.reason,
    message,
    response,
    requestId: response.requestId,
  };
}

function interpretFault(tab: Tab, fault: ClientFault): ViewModel {
  if (fault.kind === "timeout") {
    return {
      kind: "friendly",
      title: "No decision returned",
      message: "The decision service did not respond in time. No decision body was returned.",
      requestId: null,
    };
  }

  if (fault.kind === "network") {
    return {
      kind: "friendly",
      title: "No decision returned",
      message: "The decision service could not be reached. No decision body was returned.",
      requestId: null,
    };
  }

  const decisionBody = decideResponseSchema.safeParse(fault.body);
  const errorBody = apiErrorSchema.safeParse(fault.body);
  const code = errorBody.success ? errorBody.data.error.code : null;
  const requestId = errorBody.success ? errorBody.data.requestId : null;
  const serverMessage = errorBody.success ? errorBody.data.error.message : null;

  if (fault.status === 429 || code === "rate_limited") {
    return {
      kind: "cooldown",
      retryAfterMs: errorBody.success ? (errorBody.data.retryAfterMs ?? 0) : 0,
      message: serverMessage ?? "Too many requests. Wait before trying again.",
      requestId,
    };
  }

  if (fault.status === 401 || code === "unauthorized") {
    return {
      kind: "auth",
      message: "The session is not authorized. Enter the passcode again.",
      requestId,
    };
  }

  if (fault.status === 400 || code === "bad_request") {
    return {
      kind: "friendly",
      title: "Request not accepted",
      message: serverMessage ?? "The service rejected this request. Check the fields and try again.",
      requestId,
    };
  }

  if (decisionBody.success) {
    return verdictModel(
      decisionBody.data,
      tab,
      "The service returned a decision with this outcome.",
    );
  }

  return {
    kind: "friendly",
    title: "Upstream error",
    message: serverMessage ?? "The decision service returned an error without a decision.",
    requestId,
  };
}

export function interpretDecide(tab: Tab, result: TransportResult<DecideResponse>): ViewModel {
  if (!result.ok) return interpretFault(tab, result.fault);
  return verdictModel(result.data, tab, "Decision recorded.");
}

export type LogDraft = {
  tab: Tab;
  decision: string;
  confidence: number | null;
  latencyMs: number | null;
  requestId: string | null;
};

const LOG_KEYS = ["tab", "decision", "confidence", "latencyMs", "requestId"] as const;

export function toLogDraft(tab: Tab, model: ViewModel): LogDraft {
  if (model.kind === "cooldown") {
    return {
      tab,
      decision: "rate_limited",
      confidence: null,
      latencyMs: null,
      requestId: model.requestId,
    };
  }
  if (model.kind === "auth") {
    return {
      tab,
      decision: "unauthorized",
      confidence: null,
      latencyMs: null,
      requestId: model.requestId,
    };
  }
  if (model.kind === "friendly") {
    return {
      tab,
      decision: "error",
      confidence: null,
      latencyMs: null,
      requestId: model.requestId,
    };
  }

  return {
    tab,
    decision: `${model.headline} (${model.reason})`,
    confidence: model.response.confidence,
    latencyMs: model.response.latencyMs,
    requestId: model.response.requestId,
  };
}

export function logDraftKeys(draft: LogDraft): string[] {
  return Object.keys(draft).filter((key) => (LOG_KEYS as readonly string[]).includes(key));
}

export type PasscodeView =
  | { kind: "ok"; requestId: string }
  | { kind: "denied"; message: string; requestId: string | null }
  | {
      kind: "cooldown";
      retryAfterMs: number;
      message: string;
      requestId: string | null;
    }
  | { kind: "friendly"; message: string; requestId: string | null };

export function interpretPasscode(
  result: TransportResult<{ ok: true; requestId: string }>,
): PasscodeView {
  if (result.ok) {
    return { kind: "ok", requestId: result.data.requestId };
  }
  const fault = result.fault;
  if (fault.kind === "timeout" || fault.kind === "network") {
    return {
      kind: "friendly",
      message: "The sign-in service did not respond. Try again shortly.",
      requestId: null,
    };
  }
  const parsed = apiErrorSchema.safeParse(fault.body);
  const requestId = parsed.success ? parsed.data.requestId : null;
  const code = parsed.success ? parsed.data.error.code : null;

  if (fault.status === 429 || code === "rate_limited") {
    return {
      kind: "cooldown",
      retryAfterMs: parsed.success ? (parsed.data.retryAfterMs ?? 0) : 0,
      message: parsed.success
        ? parsed.data.error.message
        : "Too many attempts. Wait before trying again.",
      requestId,
    };
  }
  if (fault.status === 401 || code === "unauthorized") {
    return {
      kind: "denied",
      message: "That passcode was not accepted.",
      requestId,
    };
  }
  if (fault.status === 400 || code === "bad_request") {
    return {
      kind: "friendly",
      message: "The sign-in request was rejected. Check the passcode and try again.",
      requestId,
    };
  }
  return {
    kind: "friendly",
    message: "The sign-in service is unavailable. Try again shortly.",
    requestId,
  };
}
