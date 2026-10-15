"use client";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-24">
      <h1 className="display-lg">This page hit an unexpected error</h1>
      <p className="lede mt-4">
        The console could not keep rendering. Nothing on this screen is an automated security
        action.
      </p>
      {error.digest ? (
        <p className="mt-4 font-mono text-xs break-all text-muted">Reference {error.digest}</p>
      ) : null}
      <button type="button" onClick={() => retry()} className="btn-primary mt-8 w-fit">
        Try again
      </button>
    </main>
  );
}
