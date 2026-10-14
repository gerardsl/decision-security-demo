import { PasscodeForm } from "@/app/login/passcode-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-zinc-500">Decision-1 Security Demo</p>
        <h1 className="text-3xl font-semibold tracking-tight">Enter the demo passcode</h1>
      </div>
      <PasscodeForm />
    </main>
  );
}
