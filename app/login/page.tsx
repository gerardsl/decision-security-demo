import { Suspense } from "react";
import { PasscodeForm } from "@/app/login/passcode-form";
import { DemoProvider } from "@/components/demo-context";

export default function LoginPage() {
  return (
    <DemoProvider>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-[0.18em] text-cyan-200 uppercase">
            Decision-1 Security Demo
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50">Enter the demo passcode</h1>
          <p className="text-sm leading-6 text-slate-300">
            The passcode is checked by the service and is not stored in the browser.
          </p>
        </div>
        <Suspense fallback={<p className="text-sm text-slate-400">Loading sign-in…</p>}>
          <PasscodeForm />
        </Suspense>
      </main>
    </DemoProvider>
  );
}
