import { isMockEnabled } from "@/lib/flags";

export function MockDataBanner() {
  if (!isMockEnabled()) return null;
  return (
    <p
      role="status"
      data-testid="mock-data-banner"
      className="sticky top-0 z-50 bg-amber-300 px-4 py-2 text-center text-sm font-semibold text-slate-950"
    >
      Mock data — not real Decision-1 verdicts
    </p>
  );
}
