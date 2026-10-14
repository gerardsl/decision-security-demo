"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function PasscodeForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const passcode = String(new FormData(event.currentTarget).get("passcode") ?? "");
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/passcode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!response.ok) {
        setError("That passcode was not accepted.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("That passcode was not accepted.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-3">
      <label htmlFor="passcode" className="text-sm font-medium">
        Passcode
      </label>
      <input
        id="passcode"
        name="passcode"
        type="password"
        autoComplete="current-password"
        required
        className="rounded-md border border-zinc-300 bg-transparent px-3 py-2"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-2 text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Continue
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </form>
  );
}
