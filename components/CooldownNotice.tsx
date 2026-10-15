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
      className="notice notice-caution px-5 py-4 text-sm"
    >
      <p className="font-medium text-caution">Rate limited</p>
      <p className="mt-1 whitespace-pre-wrap break-words">{message}</p>
      <p className="mt-1 font-mono text-ink">Try again in {seconds}s.</p>
    </div>
  );
}
