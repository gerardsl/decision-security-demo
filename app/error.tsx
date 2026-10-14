"use client";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold text-slate-50">This page hit an unexpected error</h1>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        The console could not keep rendering. Nothing on this screen is an automated security
        action.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs break-all text-slate-400">Reference {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-6 w-fit rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950"
      >
        Try again
      </button>
    </main>
  );
}
