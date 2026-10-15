import { isMockEnabled } from "@/lib/flags";

export function MockDataBanner() {
  if (!isMockEnabled()) return null;
  return (
    <p
      role="status"
      data-testid="mock-data-banner"
      className="sticky top-0 z-50 bg-primary px-4 py-2.5 text-center text-sm font-medium tracking-normal text-on-primary"
    >
      Mock data — not real Decision-1 verdicts
    </p>
  );
}
