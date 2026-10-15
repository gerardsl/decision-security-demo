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
      className="surface-card mt-8 flex w-full flex-col gap-4 p-6 sm:p-8"
      data-testid="passcode-form"
      noValidate
    >
      <label htmlFor="passcode" className="text-sm font-medium text-ink">
        Passcode
      </label>
      <input
        id="passcode"
        name="passcode"
        type="password"
        autoComplete="current-password"
        required
        spellCheck={false}
        className="field-control"
      />
      <button
        type="submit"
        disabled={pending || cooling}
        aria-busy={pending}
        className="btn-primary mt-1 w-fit"
      >
        {pending ? "Checking…" : "Continue"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {cooling ? <CooldownNotice remainingMs={remainingMs} message={cooldownMessage} /> : null}
      <MockScenarioControl />
    </form>
  );
}
