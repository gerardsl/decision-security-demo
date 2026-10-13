# Decision-1 Security Demo

Next.js (App Router, TypeScript) demo that asks [Microsoft Decision-1](https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-microsoft-decision) for a typed security judgment. The UI and the API share one contract in `lib/contract.ts`.

This repository starts with the scaffold, the contract, and synthetic arena fixtures. Route handlers live on the backend branch.

## Contract

`POST /api/decide`

```ts
{
  tab: "phishing" | "soc" | "mcp" | "dlp" | "arena",
  input: /* per-tab object, see lib/contract.ts */
}
```

| Tab | Input | Decision | On timeout, upstream error, or confidence &lt; 0.7 |
| --- | --- | --- | --- |
| `phishing` | `sender`, `subject`, `body` | yes/no, true means phishing | `undecided` (fail open) |
| `soc` | alert fields (`alertId`, `title`, `severity`, `source`, `description`, optional `timestamp`, `host`, `user`) | choice: `benign`, `suspicious`, `malicious` | `undecided` (fail open) |
| `mcp` | `toolName`, `args`, `agentContext` | yes/no, true means block the tool call | `blocked` (fail closed) |
| `dlp` | `prompt` | score from 0 (`none`) through 4 (`critical`) | `blocked` (fail closed) |
| `arena` | `prompt` | yes/no, true means jailbreak or prompt injection | `blocked` (fail closed) |

Success body:

```ts
{
  decision:
    | { type: "yesno"; value: boolean }
    | { type: "choice"; value: string; options: { label: string; score?: number }[] }
    | { type: "score"; value: number; min: number; max: number },
  confidence: number, // 0..1
  rationale?: string,
  status: "decided" | "blocked" | "undecided",
  reason?: "timeout" | "upstream" | "lowconf",
  latencyMs: number,
  requestId: string
}
```

`reason` is present only when `status` is `blocked` or `undecided`. Choice `options` and score `min` / `max` are fixed by the server templates. Option `score`, when present, is that option's probability from 0 through 1.

`POST /api/arena/round`

```ts
// request — history is untrusted and capped at 10 rounds
{ history?: { prompt: string; verdict: /* decide response */ }[] }

// response
{ attack: { prompt: string }; verdict: /* decide response */; round: number }
```

The server is stateless. It replays `fixtures/arena-attacks.json` unless a separate attacker deployment is enabled. The attack prompt is data to judge, not part of the question.

`POST /api/auth/passcode`

```ts
{ passcode: string }
// 200
{ ok: true, requestId: string }
```

Error body (400, 401, 429, 502):

```ts
{ error: { code: "bad_request" | "unauthorized" | "rate_limited" | "upstream"; message: string }; requestId: string; retryAfterMs?: number }
```

`rate_limited` (429) always includes `retryAfterMs`.

Schemas and inferred types are exported from `lib/contract.ts`.

## Arena fixtures

`fixtures/arena-attacks.json` holds 30 synthetic jailbreak and prompt-injection strings for the demo. They are invented examples, not customer data and not operational exploit procedures.

## Environment

Copy `.env.example` for the variable names. Values are set in Vercel, never committed.

| Name | Purpose |
| --- | --- |
| `AZURE_CLIENT_SECRET` | Entra client secret for Decision-1. The only Decision-1 secret. |
| `UPSTASH_REDIS_REST_URL` | Shared rate-limit storage. |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token. |
| `DEMO_PASSCODE` | Demo gate. |
| `SESSION_SECRET` | Signs the session cookie. |
| `DEMO_FAULT_INJECTION` | Set to `1` only outside production to honor `x-demo-fault`. |
| `ARENA_LIVE_ATTACKER` | Set to `1` to call the separate attacker deployment. |
| `ATTACKER_ENDPOINT` | Attacker deployment URL. Not the Decision-1 endpoint. |
| `ATTACKER_API_KEY` | Attacker credential. Not `AZURE_CLIENT_SECRET`. |
| `ATTACKER_MODEL` | Attacker model or deployment name. |

Decision-1 endpoint, deployment name (`Decision-1`), tenant id, and client id are fixed in server code. They are resource identifiers, not secrets.

## Scripts

```bash
npm install
npm run dev
npm run lint
npm run build
```

## Upstream

Decision-1 is called at `POST https://decision-gerards-resource.services.ai.azure.com/providers/microsoft/v1/systemone` with Microsoft Entra ID (`ClientSecretCredential`, scope `https://cognitiveservices.azure.com/.default`). The request uses the published System One shape: `model`, `state`, and typed `questions` (`noul`, `choice`, `score`). See the Foundry how-to linked above.
