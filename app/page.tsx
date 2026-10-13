export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-16">
      <p className="text-sm font-medium text-zinc-500">Decision-1 Security Demo</p>
      <h1 className="text-3xl font-semibold tracking-tight">Backend contract is in lib/contract.ts</h1>
      <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        The UI for the phishing, SOC, MCP, DLP, and arena tabs builds on the shared Zod
        schemas. API routes are added on the backend branch.
      </p>
    </main>
  );
}
