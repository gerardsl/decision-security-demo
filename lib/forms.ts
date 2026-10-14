import {
  arenaInputSchema,
  dlpInputSchema,
  mcpInputSchema,
  phishingInputSchema,
  socInputSchema,
  type ArenaInput,
  type DecideRequest,
  type DlpInput,
  type McpInput,
  type PhishingInput,
  type SocInput,
} from "@/lib/contract";

export type FieldErrors = Record<string, string>;

type Issue = { path: PropertyKey[]; message: string };

export function issuesToFieldErrors(issues: readonly Issue[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.length === 0 ? "form" : String(issue.path[0]);
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export type ParseResult<T> =
  | { success: true; input: T }
  | { success: false; errors: FieldErrors };

function fromSchema<T>(
  parsed:
    | { success: true; data: T }
    | { success: false; error: { issues: readonly Issue[] } },
): ParseResult<T> {
  if (parsed.success) return { success: true, input: parsed.data };
  return { success: false, errors: issuesToFieldErrors(parsed.error.issues) };
}

export function parsePhishing(values: Record<string, string>): ParseResult<PhishingInput> {
  return fromSchema(
    phishingInputSchema.safeParse({
      sender: values.sender ?? "",
      subject: values.subject ?? "",
      body: values.body ?? "",
    }),
  );
}

export function parseSoc(values: Record<string, string>): ParseResult<SocInput> {
  const input: Record<string, string> = {
    alertId: values.alertId ?? "",
    title: values.title ?? "",
    severity: values.severity ?? "",
    source: values.source ?? "",
    description: values.description ?? "",
  };
  for (const key of ["timestamp", "host", "user"] as const) {
    const value = values[key]?.trim() ?? "";
    if (value.length > 0) input[key] = value;
  }
  return fromSchema(socInputSchema.safeParse(input));
}

export function parseMcp(values: Record<string, string>): ParseResult<McpInput> {
  let args: unknown;
  try {
    args = JSON.parse(values.args ?? "");
  } catch {
    return { success: false, errors: { args: "Arguments must be JSON." } };
  }
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    return { success: false, errors: { args: "Arguments must be a JSON object." } };
  }
  return fromSchema(
    mcpInputSchema.safeParse({
      toolName: values.toolName ?? "",
      args,
      agentContext: values.agentContext ?? "",
    }),
  );
}

export function parseDlp(values: Record<string, string>): ParseResult<DlpInput> {
  return fromSchema(dlpInputSchema.safeParse({ prompt: values.prompt ?? "" }));
}

export function parseArenaPrompt(values: Record<string, string>): ParseResult<ArenaInput> {
  return fromSchema(arenaInputSchema.safeParse({ prompt: values.prompt ?? "" }));
}

function asRequest<T extends DecideRequest>(parsed: ParseResult<T["input"]>, tab: T["tab"]): ParseResult<DecideRequest> {
  if (!parsed.success) return parsed;
  return { success: true, input: { tab, input: parsed.input } as DecideRequest };
}

export function buildPhishingRequest(values: Record<string, string>): ParseResult<DecideRequest> {
  return asRequest(parsePhishing(values), "phishing");
}

export function buildSocRequest(values: Record<string, string>): ParseResult<DecideRequest> {
  return asRequest(parseSoc(values), "soc");
}

export function buildMcpRequest(values: Record<string, string>): ParseResult<DecideRequest> {
  return asRequest(parseMcp(values), "mcp");
}

export function buildDlpRequest(values: Record<string, string>): ParseResult<DecideRequest> {
  return asRequest(parseDlp(values), "dlp");
}

export function buildArenaRequest(values: Record<string, string>): ParseResult<DecideRequest> {
  return asRequest(parseArenaPrompt(values), "arena");
}
