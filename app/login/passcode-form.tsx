"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { passcodeRequestSchema } from "@/lib/contract";
import { submitPasscode } from "@/lib/api-client";
import { interpretPasscode } from "@/lib/interpret";
import { safeNextPath } from "@/lib/return-to";
import { CooldownNotice } from "@/components/CooldownNotice";
import { MockScenarioControl } from "@/components/MockScenarioControl";
import { useDemo } from "@/components/demo-context";

export function PasscodeForm() {
  const router = useRouter();
  const demo = useDemo();
  const nextPath = useSearchParams().get("next");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownMessage, setCooldownMessage] = useState("");
  const [now, setNow] = useState(0);
  const destination = safeNextPath(nextPath);

  useEffect(() => {
    if (cooldownUntil === null) return;
    const id = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= cooldownUntil) setCooldownUntil(null);
    }, 200);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  const remainingMs = cooldownUntil === null ? 0 : Math.max(0, cooldownUntil - now);
  const cooling = remainingMs > 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || cooling) return;
    const form = event.currentTarget;
    const passcode = String(new FormData(form).get("passcode") ?? "");
    const parsed = passcodeRequestSchema.safeParse({ passcode });
    form.reset();
    if (!parsed.success) {
      setError("Enter the passcode.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await submitPasscode(parsed.data.passcode, demo.scenario);
      const view = interpretPasscode(result);
      if (view.kind === "ok") {
        router.push(destination);
        router.refresh();
        return;
      }
      if (view.kind === "cooldown" && view.retryAfterMs > 0) {
        setCooldownMessage(view.message);
        setCooldownUntil(Date.now() + view.retryAfterMs);
        setNow(Date.now());
        return;
      }
      if (view.kind === "denied") {
        setError("That passcode was not accepted.");
        return;
      }
      setError(view.message);
    } catch {
      setError("The sign-in service did not respond. Try again shortly.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      method="post"
      action="/api/auth/passcode"
      onSubmit={onSubmit}
      className="flex w-full flex-col gap-3 rounded-2xl border border-white/10 bg-[#10192b] p-5"
      data-testid="passcode-form"
      noValidate
    >
      <label htmlFor="passcode" className="text-sm font-medium text-slate-200">
        Passcode
      </label>
      <input
        id="passcode"
        name="passcode"
        type="password"
        autoComplete="current-password"
        required
        spellCheck={false}
        className="rounded-md border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-slate-100 outline-none focus-visible:border-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-300/40"
      />
      <button
        type="submit"
        disabled={pending || cooling}
        aria-busy={pending}
        className="rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Checking…" : "Continue"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-rose-200">
          {error}
        </p>
      ) : null}
      {cooling ? <CooldownNotice remainingMs={remainingMs} message={cooldownMessage} /> : null}
      <MockScenarioControl />
    </form>
  );
}
