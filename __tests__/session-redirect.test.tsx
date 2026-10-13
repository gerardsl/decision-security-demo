import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PhishingPanel } from "@/components/panels";
import { DemoProvider } from "@/components/demo-context";
import { loginPathForTab } from "@/lib/return-to";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/api-client", () => ({
  submitDecide: vi.fn(async () => ({
    ok: false,
    fault: {
      kind: "http",
      status: 401,
      body: {
        error: { code: "unauthorized", message: "Authentication required." },
        requestId: "44444444-4444-4444-8444-444444444444",
      },
    },
  })),
}));

describe("missing session redirect", () => {
  beforeEach(() => {
    push.mockClear();
  });

  test("sends a 401 to login with the current tab", async () => {
    render(
      <DemoProvider>
        <PhishingPanel />
      </DemoProvider>,
    );
    fireEvent.click(screen.getByTestId("submit-decision"));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(loginPathForTab("phishing"));
    });
  });
});
