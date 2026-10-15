import { Suspense } from "react";
import { PasscodeForm } from "@/app/login/passcode-form";
import { DemoProvider } from "@/components/demo-context";

export default function LoginPage() {
  return (
    <DemoProvider>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-20 sm:py-28">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">Decision-1 Security Demo</p>
          <h1 className="display-mega text-balance">Enter the demo passcode</h1>
          <p className="lede text-pretty">
            The passcode is checked by the service and is not stored in the browser.
          </p>
        </div>
        <Suspense fallback={<p className="lede mt-8">Loading sign-in…</p>}>
          <PasscodeForm />
        </Suspense>
      </main>
    </DemoProvider>
  );
}
