# Decision-1 Security Demo

Next.js (App Router, TypeScript) demo that asks [Microsoft Decision-1](https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-microsoft-decision) for a typed security judgment. The UI and the API share one contract in `lib/contract.ts`.

The API validates every request with the Zod schemas in `lib/contract.ts`, asks Decision-1 a fixed question, and returns a typed decision. Pages other than `/login` require the session cookie. In Next.js 16 the page check lives in `proxy.ts` (the replacement for middleware). Each API route checks the cookie again.

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

HTTP status for `POST /api/decide` and `POST /api/arena/round`:

| Outcome | HTTP | Body |
| --- | --- | --- |
| Confident answer | 200 | `status: "decided"` |
| Timeout or upstream transport/HTTP failure | 200 | `status: "blocked"` or `"undecided"`, `reason: "timeout"` or `"upstream"` |
| Confidence below 0.7 | 200 | same status rule, `reason: "lowconf"`, decision is the validated answer |
| Malformed or out-of-range model output | 502 | error envelope, model values are not copied |
| Bad JSON, unknown fields, or oversized body (64 KiB) | 400 | `bad_request` |
| Missing or invalid session cookie | 401 | `unauthorized` |
| Rate limit, or the rate-limit store is unavailable | 429 | `rate_limited` and `retryAfterMs` |

Closed tabs (`mcp`, `dlp`, `arena`) must be treated as blocked on any non-200 response. A timeout or transport failure still returns 200 so the client can read `status: "blocked"` instead of guessing.

`POST /api/arena/round`

```ts
// request — history is untrusted and capped at 10 rounds
{ history?: { prompt: string; verdict: /* decide response */ }[] }

// response
{ attack: { prompt: string }; verdict: /* decide response */; round: number }
```

The server is stateless. It replays `fixtures/arena-attacks.json` unless `ARENA_LIVE_ATTACKER=1`. History is untrusted: more than 9 prior rounds (a 10th completed round cannot start another), prompts over 4,000 characters, and verdicts that do not match the decide schema are rejected with 400. The next fixture is chosen from the validated history length. The attack prompt is placed only in the delimited state, never in the question text.

`x-demo-fault: timeout | upstream | lowconf` is honored only when `DEMO_FAULT_INJECTION=1`, `VERCEL_ENV` is not `production`, and the session cookie is valid. Those faults use the same failure path as a real timeout, upstream error, or low-confidence answer. The production build fails when `DEMO_FAULT_INJECTION=1` and `VERCEL_ENV=production`.

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
| `SESSION_SECRET` | Signs the session cookie. At least 16 characters. |
| `DEMO_FAULT_INJECTION` | Set to `1` only outside production to honor `x-demo-fault`. |
| `ARENA_LIVE_ATTACKER` | Set to `1` to call the separate attacker deployment. |
| `ATTACKER_ENDPOINT` | Attacker deployment URL (`https`). Not the Decision-1 endpoint. |
| `ATTACKER_API_KEY` | Attacker credential. Must differ from `AZURE_CLIENT_SECRET`. |
| `ATTACKER_MODEL` | Attacker model or deployment name. |

Required in Vercel for a working demo: `AZURE_CLIENT_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `DEMO_PASSCODE`, and `SESSION_SECRET`. Without Upstash the API fails closed with 429. The attacker variables are required only when `ARENA_LIVE_ATTACKER=1`.

Decision-1 endpoint, deployment name (`Decision-1`), tenant id, and client id are fixed in `lib/upstream.ts`. They are resource identifiers, not secrets. The client secret and access token are never logged or returned.

## Scripts

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

GitHub Actions runs lint, typecheck, tests, and build.

## Upstream

Decision-1 is called at `POST https://decision-gerards-resource.services.ai.azure.com/providers/microsoft/v1/systemone` with Microsoft Entra ID (`ClientSecretCredential`, scope `https://cognitiveservices.azure.com/.default`). The credential object caches and refreshes tokens. The request uses the published System One shape from the Foundry how-to and the Databricks System One reference: `model`, `state`, and one typed question (`noul`, `choice`, or `score`). User text is only in `state`, inside `<<<UNTRUSTED_DATA>>>` markers. The question `instructions` are fixed templates.

Open points, called out in code rather than guessed silently:

- Published noul responses contain `noul` (probability of yes) and do not show a separate confidence. The adapter uses an explicit `confidence` field when present, otherwise `max(noul, 1 - noul)`, and treats `noul >= 0.5` as yes.
- Score results are documented as probability-weighted indexes on a 0-based criteria array and may fall between levels. DLP uses 0 through 4. A 1-based score would be rejected as out of range.
- `model` is sent as `Decision-1`, the deployment name from this project. Foundry uses the deployment name in the request, which can differ from the underlying model id `microsoft-decision-1`. A differently named deployment will fail the call.
- The separate arena attacker is not deployed. `ARENA_LIVE_ATTACKER=1` assumes an OpenAI-compatible chat-completions endpoint, sends no tools, and uses only `ATTACKER_*` credentials. See the TODO in `lib/attacker.ts`.
