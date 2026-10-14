import type { DecisionReason, Tab } from "@/lib/contract";
import { reasonLabel, type HeadlineTone, type ViewModel } from "@/lib/interpret";
import { CooldownNotice } from "@/components/CooldownNotice";
import { DecisionCard } from "@/components/DecisionCard";

function toneClass(tone: HeadlineTone): string {
  if (tone === "danger") return "bg-rose-500/15 text-rose-100 ring-rose-400/40";
  if (tone === "caution") return "bg-amber-400/15 text-amber-50 ring-amber-300/40";
  return "bg-emerald-500/15 text-emerald-100 ring-emerald-300/40";
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
        className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ring-1 ${toneClass(tone)}`}
      >
        {headline}
      </span>
      <span data-testid="policy-reason" className="text-sm text-slate-200">
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
      <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-50">
        {model.message}
      </p>
    );
  }

  if (model.kind === "friendly") {
    return (
      <div role="alert" data-testid="friendly-error" className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#10192b] p-4">
        <h3 className="text-base font-semibold text-slate-50">{model.title}</h3>
        <p className="text-sm leading-6 whitespace-pre-wrap break-words text-slate-200">{model.message}</p>
        {model.requestId ? (
          <p className="font-mono text-xs break-all text-slate-400">Request ID {model.requestId}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <PolicyBanner headline={model.headline} tone={model.tone} reason={model.reason} />
      <p className="text-sm leading-6 text-slate-300">{model.message}</p>
      <DecisionCard response={model.response} tab={tab} />
    </div>
  );
}
