import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { MockDataBanner } from "@/components/MockDataBanner";

const BANNER = "Mock data — not real Decision-1 verdicts";

describe("mock data banner", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("shows a persistent warning on every page when mock mode is on", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "1");
    render(<MockDataBanner />);
    const banner = screen.getByTestId("mock-data-banner");
    expect(banner.textContent).toBe(BANNER);
    expect(banner.getAttribute("role")).toBe("status");
  });

  test("stays hidden when mock mode is off", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "");
    render(<MockDataBanner />);
    expect(screen.queryByTestId("mock-data-banner")).toBeNull();
    expect(screen.queryByText(BANNER)).toBeNull();
  });
});
