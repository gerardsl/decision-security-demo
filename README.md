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

| Tab | Input | Decision | Policy |
| --- | --- | --- | --- |
| `phishing` | `sender`, `subject`, `body` | yes/no, true means phishing | Failures and confidence below 0.7 are `undecided`. A confident answer is `allow` (the judgment is usable; true still means phishing). |
| `soc` | alert fields (`alertId`, `title`, `severity`, `source`, `description`, optional `timestamp`, `host`, `user`) | choice: `benign`, `suspicious`, `malicious` | Failures and confidence below 0.7 are `undecided`. A confident label is `allow`. |
| `mcp` | `toolName`, `args`, `agentContext` | yes/no, true means the tool call is allowed | `allow` only when the answer is yes and confidence is at least 0.7. Everything else is `block`. |
| `dlp` | `prompt` | float score from 0 (`none`) through 4 (`critical`) | `allow` when confidence is at least 0.7 and the score is below 2. A score of 2.0 or higher is `block` (`score_threshold`). `1.99` allows. |
| `arena` | `prompt` | yes/no, true means the prompt is allowed | Same allow rule as `mcp`. A confident no is `block` (`policy_unsafe`). |

Success body:

```ts
{
  decision:
    | { type: "yesno"; value: boolean }
    | {
        type: "choice";
        value: string;
        options: { label: string; score?: number }[];
        probabilities: Record<string, number>;
      }
    | { type: "score"; value: number; min: number; max: number; probabilities: Record<string, number> },
  confidence: number, // 0..1
  rationale?: string,
  outcome: "allow" | "block" | "undecided",
  reason:
    | "policy_unsafe"
    | "low_confidence"
    | "timeout"
    | "upstream_error"
    | "score_threshold"
    | "invalid_option"
    | "ok",
  latencyMs: number,
  requestId: string
}
```

`outcome` is `allow` only when `reason` is `ok`. Choice `options`, score `min` / `max` (0 and 4), and the DLP cutoff (`DLP_BLOCK_SCORE`, 2) come from the server templates. `decision.probabilities` is the per-option or per-level map from the model, with keys limited to those templates. Option `score`, when present, is that option's probability from 0 through 1. Score `value` is a float, including values between levels such as `2.97`.

HTTP status for `POST /api/decide` and `POST /api/arena/round`:

| Case | HTTP | Body |
| --- | --- | --- |
| Confident allow answer | 200 | Decide body. `outcome: "allow"`, `reason: "ok"` |
| Guardrail answer that is not the allow answer, confidence at least 0.7 | 200 | Decide body. `outcome: "block"`, `reason: "policy_unsafe"` (mcp, arena) or `"score_threshold"` (dlp score ≥ 2) |
| Confidence below 0.7 | 200 | Decide body. `reason: "low_confidence"`. Guardrails `block`; phishing and soc are `undecided`. The validated answer is kept. |
| Timeout | 502 | Decide body. `reason: "timeout"`. Guardrails `block`; phishing and soc are `undecided`. |
| Upstream transport or HTTP failure, or a malformed or out-of-range answer | 502 | Decide body. `reason: "upstream_error"`. Guardrails `block`; phishing and soc are `undecided`. Model values are not copied. |
| Choice or legend key outside the server template | 502 | Decide body. `reason: "invalid_option"`. The bad label is not copied. Guardrails `block`; phishing and soc are `undecided`. |
| Bad JSON, unknown fields, or oversized body (64 KiB) | 400 | Bare `{ error: { code: "bad_request", message }, requestId }` |
| Missing or invalid session cookie | 401 | Bare `{ error: { code: "unauthorized", message }, requestId }` |
| Rate limit, or the rate-limit store is unavailable | 429 | `{ error: { code: "rate_limited", message }, requestId, retryAfterMs }` |

A decide body is `decision`, `confidence`, `outcome`, `reason`, `latencyMs`, and `requestId`. Timeout, upstream failure, a malformed answer, and an invalid option use HTTP 502 with that body, not the error envelope. Treat `mcp`, `dlp`, and `arena` as blocked when `outcome` is `block`.

`POST /api/arena/round`

```ts
// request — history is untrusted and capped at 10 rounds
{ history?: { prompt: string; verdict: /* decide response */ }[] }

// response
{ attack: { prompt: string }; verdict: /* decide response */; round: number }
```

The server is stateless. It replays `fixtures/arena-attacks.json` unless `ARENA_LIVE_ATTACKER=1`. History is untrusted: more than 9 prior rounds (a 10th completed round cannot start another), prompts over 4,000 characters, and verdicts that do not match the decide schema are rejected with 400. The next fixture is chosen from the validated history length. The attack prompt is placed only in the delimited state, never in the question text.

`x-demo-fault` is honored only when `DEMO_FAULT_INJECTION=1`, `VERCEL_ENV` is not `production`, and the session cookie is valid. The production build fails when `DEMO_FAULT_INJECTION=1` and `VERCEL_ENV=production`.

| `x-demo-fault` | What is injected | Result |
| --- | --- | --- |
| `timeout` | The same timeout path as a real call | 502 decide body, `reason: "timeout"` |
| `upstream` | The same upstream-failure path as a real call | 502 decide body, `reason: "upstream_error"` |
| `lowconf` | A low-confidence answer through the parser | 200 decide body, `reason: "low_confidence"` |
| `malformed` | An upstream response with the wrong shape, through the parser | 502 decide body, `reason: "upstream_error"` |
| `badoption` | A choice value outside the server template, through the parser | 502 decide body, `reason: "invalid_option"` |
| `badlegend` | A DLP score whose legend keys are not `0` through `4`, through the parser | 502 decide body, `outcome: "block"`, `reason: "invalid_option"` |

`POST /api/auth/passcode`

```ts
{ passcode: string }
// 200
{ ok: true, requestId: string }
```

Error body for bad input (400), a missing cookie (401), and rate limits (429). A bare 502 error envelope is reserved for failures that are not a settled Decision-1 answer, such as the live attacker:

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

Observed response shapes, parsed by named fields only (extra fields are ignored):

- Noul: `{ "noul": 0.9987, "type": "noul" }`. `noul` is P(yes). There is no confidence, so the adapter uses `max(noul, 1 - noul)` unless an explicit `confidence` is present. `noul >= 0.5` is yes. Guardrail questions are phrased so yes means allow.
- Score: `{ "score": 2.97, "confidence": 0.90, "legend": { "0": "...", "4": "..." }, "probabilities": { "0": "...", "4": "..." } }`. `score` is a 0-based probability-weighted float and may fall between levels. Any float in `[0, 4]` is accepted. Legend keys must be exactly `0` through `4`.
- Choice: `{ "choice": "engineering", "confidence": 0.998, "probabilities": {}, "type": "choice" }`. The chosen value and every probability key must be one of the server options.
- The response `model` is `microsoft-decision-1` and is not checked against the deployment name. The request still sends `model: "Decision-1"`. A differently named deployment will fail the call.

The separate arena attacker is not deployed. `ARENA_LIVE_ATTACKER=1` assumes an OpenAI-compatible chat-completions endpoint, sends no tools, and uses only `ATTACKER_*` credentials. See the TODO in `lib/attacker.ts`.
