import {
  DLP_LEVELS,
  type DecideResponse,
  type Tab,
} from "@/lib/contract";
import { decisionSummary, yesNoMeaning } from "@/lib/interpret";

export const CONFIDENCE_CAPTION =
  "Model-reported confidence, not a calibrated probability";

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

/** Preserves fractional scores such as 2.97 instead of snapping to an integer. */
function formatExact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const text = Object.is(value, -0) ? "0" : value.toString();
  if (!/[eE]/.test(text)) return text;
  return value.toFixed(8).replace(/\.?0+$/, "");
}

export function DecisionCard({ response, tab }: { response: DecideResponse; tab: Tab }) {
  const { decision } = response;
  const confidencePct = clampPercent(response.confidence * 100);

  return (
    <article
      data-testid="decision-card"
      className="surface-card-quiet p-5 sm:p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="eyebrow">Model output</h3>
        <p className="text-sm text-muted">
          Summary <span className="font-medium text-ink">{decisionSummary(decision)}</span>
        </p>
      </header>

      <div className="mt-4">
        {decision.type === "yesno" ? (
          <div className="flex flex-wrap items-center gap-3">
            <span
              data-testid="yesno-badge"
              data-decision={decision.value ? "yes" : "no"}
              className={`verdict ${
                (tab === "phishing" ? decision.value : !decision.value) ? "verdict-danger" : "verdict-safe"
              }`}
            >
              {decision.value ? "Yes" : "No"}
            </span>
            <p className="text-sm text-ink">{yesNoMeaning(tab, decision.value)}</p>
          </div>
        ) : null}

        {decision.type === "choice" ? (
          <ul data-testid="choice-options" className="grid gap-2">
            {decision.options.map((option, index) => {
              const chosen = option.label === decision.value;
              const probability = decision.probabilities[option.label] ?? option.score;
              return (
                <li
                  key={`${option.label}-${index}`}
                  data-chosen={chosen ? "true" : "false"}
                  aria-current={chosen ? "true" : undefined}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
                    chosen ? "border-ink bg-surface text-ink" : "border-hairline bg-surface text-body"
                  }`}
                >
                  <span>
                    {chosen ? <span className="mr-2 font-medium">Chosen</span> : null}
                    {option.label}
                  </span>
                  {probability === undefined ? null : (
                    <span
                      data-testid="choice-probability"
                      className="font-mono text-xs text-muted"
                    >
                      p {formatExact(probability)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}

        {decision.type === "score" ? <ScoreBar decision={decision} /> : null}
      </div>

      <div className="mt-5">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="text-body">Confidence</span>
          <span className="font-mono text-ink">{formatNumber(response.confidence)}</span>
        </div>
        <div
          role="meter"
          aria-label="Model-reported confidence"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={response.confidence}
          className="meter-track h-2"
        >
          <div
            data-testid="confidence-fill"
            className="meter-fill"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
        <p data-testid="confidence-caption" className="mt-2 text-xs leading-5 text-muted">
          {CONFIDENCE_CAPTION}
        </p>
      </div>

      <div className="mt-5">
        <h4 className="text-sm font-medium text-ink">Rationale</h4>
        <p className="mt-1 text-sm leading-6 whitespace-pre-wrap break-words text-body">
          {response.rationale && response.rationale.length > 0
            ? response.rationale
            : "No rationale was returned."}
        </p>
      </div>

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Latency</dt>
          <dd className="font-mono text-ink">{formatNumber(response.latencyMs)} ms</dd>
        </div>
        <div>
          <dt className="text-muted">Request ID</dt>
          <dd className="font-mono break-all text-ink">{response.requestId}</dd>
        </div>
      </dl>
    </article>
  );
}

function ScoreBar({
  decision,
}: {
  decision: Extract<DecideResponse["decision"], { type: "score" }>;
}) {
  const span = decision.max - decision.min;
  const pct = clampPercent(span === 0 ? 100 : ((decision.value - decision.min) / span) * 100);
  const matched = DLP_LEVELS.find((level) => level.index === decision.value);
  const probabilities = decision.probabilities;
  const hasDistribution = Object.keys(probabilities).length > 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-muted">
        <span>{formatExact(decision.min)}</span>
        <span>{formatExact(decision.max)}</span>
      </div>
      <div
        role="meter"
        data-testid="score-meter"
        aria-label="Score"
        aria-valuemin={decision.min}
        aria-valuemax={decision.max}
        aria-valuenow={decision.value}
        data-score-pct={String(pct)}
        className="meter-track h-3"
      >
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-ink" data-testid="score-value">
        Score {formatExact(decision.value)}
        {matched ? ` · ${matched.label}` : ""}
      </p>
      {hasDistribution ? <ScoreDistribution probabilities={probabilities} /> : null}
      <ol className="mt-2 flex flex-wrap gap-2">
        {DLP_LEVELS.map((level) => {
          const active = level.index === decision.value;
          return (
            <li
              key={level.label}
              data-active={active ? "true" : "false"}
              className={`rounded-full px-2 py-0.5 text-xs ${
                active ? "bg-primary text-on-primary" : "bg-surface-strong text-muted"
              }`}
            >
              {level.index} {level.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ScoreDistribution({ probabilities }: { probabilities: Record<string, number> }) {
  return (
    <ul data-testid="score-distribution" className="mt-3 grid grid-cols-5 gap-2" aria-label="Score probabilities">
      {DLP_LEVELS.map((level) => {
        const probability = probabilities[String(level.index)];
        const height = probability === undefined ? 0 : clampPercent(probability * 100);
        return (
          <li key={level.label} className="flex flex-col items-center gap-1 text-center">
            <div className="flex h-16 w-full items-end rounded bg-surface-strong" aria-hidden="true">
              <div
                data-level={level.index}
                data-probability={probability === undefined ? "" : String(probability)}
                className="w-full rounded-sm bg-primary"
                style={{ height: `${height}%` }}
              />
            </div>
            <span className="text-xs text-body">
              {level.index} {level.label}
            </span>
            <span className="font-mono text-[11px] text-muted">
              {probability === undefined ? "—" : formatExact(probability)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
