export function CooldownNotice({
  remainingMs,
  message,
}: {
  remainingMs: number;
  message: string;
}) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return (
    <div
      data-testid="cooldown"
      role="status"
      aria-live="polite"
      className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-50"
    >
      <p className="font-semibold">Rate limited</p>
      <p className="mt-1 whitespace-pre-wrap break-words">{message}</p>
      <p className="mt-1 font-mono">Try again in {seconds}s.</p>
    </div>
  );
}
