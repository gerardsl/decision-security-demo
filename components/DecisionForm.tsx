"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import type { DecideRequest, Tab } from "@/lib/contract";
import { tabPolicy } from "@/lib/contract";
import { submitDecide } from "@/lib/api-client";
import type { ParseResult } from "@/lib/forms";
import { interpretDecide, toLogDraft, type ViewModel } from "@/lib/interpret";
import type { Preset } from "@/lib/presets";
import { useDemo } from "@/components/demo-context";
import { Field } from "@/components/Field";
import { OutcomeView } from "@/components/OutcomeView";

export type FieldDef = {
  name: string;
  label: string;
  multiline?: boolean;
  optional?: boolean;
  maxLength: number;
  rows?: number;
};

export function DecisionForm({
  tab,
  intro,
  presets,
  fields,
  buildRequest,
  submitLabel = "Request decision",
}: {
  tab: Tab;
  intro: string;
  presets: readonly Preset[];
  fields: readonly FieldDef[];
  buildRequest: (values: Record<string, string>) => ParseResult<DecideRequest>;
  submitLabel?: string;
}) {
  const demo = useDemo();
  const initial = presets[0];
  const [presetId, setPresetId] = useState(initial?.id ?? "");
  const [values, setValues] = useState<Record<string, string>>(initial?.values ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [model, setModel] = useState<ViewModel | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestSeq = useRef(0);
  const policy = tabPolicy[tab];

  function applyPreset(id: string) {
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    setPresetId(id);
    setValues({ ...preset.values });
    setErrors({});
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || demo.cooling) return;
    const parsed = buildRequest(values);
    if (!parsed.success) {
      setErrors(parsed.errors);
      setModel(null);
      return;
    }
    setErrors({});
    const request = parsed.input;
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    startTransition(async () => {
      const result = await submitDecide(request, demo.scenario);
      if (seq !== requestSeq.current) return;
      const view = interpretDecide(tab, result);
      if (view.kind === "auth") {
        demo.lock(tab);
        return;
      }
      if (view.kind === "cooldown") {
        demo.startCooldown(view.retryAfterMs, view.message, view.requestId);
      }
      setModel(view);
      demo.addLog(toLogDraft(tab, view));
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            policy.failMode === "closed"
              ? "bg-rose-500/10 text-rose-100"
              : "bg-amber-400/10 text-amber-50"
          }`}
        >
          Fail {policy.failMode}
        </span>
        <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300">
          {policy.decisionType}
        </span>
      </div>
      <p className="text-sm leading-6 text-slate-300">{intro}</p>
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-200">
          Sample
          <select
            value={presetId}
            onChange={(event) => applyPreset(event.target.value)}
            className="rounded-md border border-white/10 bg-[#0b1220] px-3 py-2 text-sm font-normal text-slate-100 outline-none focus-visible:border-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-300/40"
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        {fields.map((field) => (
          <Field
            key={field.name}
            id={`${tab}-${field.name}`}
            label={field.label}
            value={values[field.name] ?? ""}
            maxLength={field.maxLength}
            multiline={field.multiline}
            optional={field.optional}
            rows={field.rows}
            error={errors[field.name]}
            onChange={(next) => {
              setValues((current) => ({ ...current, [field.name]: next }));
            }}
          />
        ))}
        {errors.form ? (
          <p role="alert" className="text-sm text-rose-300">
            {errors.form}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            data-testid="submit-decision"
            disabled={isPending || demo.cooling}
            aria-busy={isPending}
            className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
          >
            {isPending ? "Judging…" : submitLabel}
          </button>
          {demo.cooling ? (
            <p className="text-sm text-amber-100">Waiting for the rate limit to clear.</p>
          ) : null}
        </div>
      </form>
      <div aria-live="polite">
        {model ? (
          <OutcomeView model={model} tab={tab} remainingMs={demo.remainingMs} />
        ) : (
          <p className="text-sm text-slate-400">Submit the sample to request a decision.</p>
        )}
      </div>
    </div>
  );
}
