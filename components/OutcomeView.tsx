import type { DecisionReason, Tab } from "@/lib/contract";
import { reasonLabel, type HeadlineTone, type ViewModel } from "@/lib/interpret";
import { CooldownNotice } from "@/components/CooldownNotice";
import { DecisionCard } from "@/components/DecisionCard";

function toneClass(tone: HeadlineTone): string {
  if (tone === "danger") return "verdict verdict-danger";
  if (tone === "caution") return "verdict verdict-caution";
  return "verdict verdict-safe";
}

export function PolicyBanner({
  headline,
  tone,
  reason,
}: {
  headline: string;
  tone: HeadlineTone;
  reason: DecisionReason;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="policy-banner">
      <span
        data-testid="policy-status"
        className={toneClass(tone)}
      >
        {headline}
      </span>
      <span data-testid="policy-reason" className="text-sm text-body">
        Reason: {reasonLabel(reason)}
      </span>
    </div>
  );
}

export function OutcomeView({
  model,
  tab,
  remainingMs = 0,
}: {
  model: ViewModel;
  tab: Tab;
  remainingMs?: number;
}) {
  if (model.kind === "cooldown") {
    return <CooldownNotice remainingMs={remainingMs} message={model.message} />;
  }

  if (model.kind === "auth") {
    return (
      <p role="alert" className="notice notice-danger px-5 py-4 text-sm">
        {model.message}
      </p>
    );
  }

  if (model.kind === "friendly") {
    return (
      <div role="alert" data-testid="friendly-error" className="surface-card flex flex-col gap-3 p-5">
        <h3 className="title">{model.title}</h3>
        <p className="lede whitespace-pre-wrap break-words">{model.message}</p>
        {model.requestId ? (
          <p className="font-mono text-xs break-all text-muted">Request ID {model.requestId}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <PolicyBanner headline={model.headline} tone={model.tone} reason={model.reason} />
      <p className="lede">{model.message}</p>
      <DecisionCard response={model.response} tab={tab} />
    </div>
  );
}
