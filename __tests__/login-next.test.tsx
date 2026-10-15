import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PasscodeForm } from "@/app/login/passcode-form";
import { DemoProvider } from "@/components/demo-context";

const push = vi.fn();
const refresh = vi.fn();
let nextQuery = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    replace: vi.fn(),
    refresh,
  }),
  useSearchParams: () => new URLSearchParams(nextQuery),
}));

vi.mock("@/lib/api-client", () => ({
  submitPasscode: vi.fn(async () => ({
    ok: true,
    data: { ok: true, requestId: "11111111-1111-4111-8111-111111111111" },
  })),
}));

async function signIn(next: string) {
  nextQuery = new URLSearchParams({ next }).toString();
  push.mockClear();
  render(
    <DemoProvider>
      <PasscodeForm />
    </DemoProvider>,
  );
  fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "demo-passcode" } });
  fireEvent.submit(screen.getByTestId("passcode-form"));
  await waitFor(() => {
    expect(push).toHaveBeenCalledTimes(1);
  });
}

describe("login return path", () => {
  beforeEach(() => {
    nextQuery = "";
    push.mockClear();
    refresh.mockClear();
  });

  test("returns to the MCP tab after a successful passcode", async () => {
    await signIn("/?tab=mcp");
    expect(push).toHaveBeenCalledWith("/?tab=mcp");
    expect(refresh).toHaveBeenCalled();
  });

  test.each([
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "%2F%2Fevil.example",
    "%252F%252Fevil.example",
  ])("sends %s back to /", async (next) => {
    await signIn(next);
    expect(push).toHaveBeenCalledWith("/");
  });
});
