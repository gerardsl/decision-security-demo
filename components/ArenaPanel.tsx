"use client";

import { useState, useTransition } from "react";
import { LIMITS, type ArenaHistoryEntry, type ArenaRoundResponse } from "@/lib/contract";
import { submitArenaRound } from "@/lib/api-client";
import { arenaFixtures, blockRate, capHistory } from "@/lib/arena-session";
import { interpretDecide, toLogDraft, type ViewModel } from "@/lib/interpret";
import { useDemo } from "@/components/demo-context";
import { OutcomeView } from "@/components/OutcomeView";
import { ArenaJudgeForm } from "@/components/panels";

type StoredRound = {
  response: ArenaRoundResponse;
  view: ViewModel;
  fixtureId: string | null;
  category: string | null;
};

function fixtureMeta(prompt: string): { id: string | null; category: string | null } {
  const match = arenaFixtures.find((fixture) => fixture.prompt === prompt);
  return { id: match?.id ?? null, category: match?.category ?? null };
}

export function ArenaPanel() {
  const demo = useDemo();
  const [history, setHistory] = useState<ArenaHistoryEntry[]>([]);
  const [rounds, setRounds] = useState<StoredRound[]>([]);
  const [failure, setFailure] = useState<ViewModel | null>(null);
  const [isPending, startTransition] = useTransition();
  const rate = blockRate(history);
  const full = history.length >= LIMITS.maxHistoryRounds;

  function reset() {
    setHistory([]);
    setRounds([]);
    setFailure(null);
  }

  function runRound() {
    if (isPending || demo.cooling || full) return;
    const snapshot = capHistory(history);
    startTransition(async () => {
      const result = await submitArenaRound(snapshot, demo.scenario);
      if (!result.ok) {
        const view = interpretDecide("arena", result);
        if (view.kind === "auth") {
          demo.lock("arena");
          return;
        }
        if (view.kind === "cooldown") {
          demo.startCooldown(view.retryAfterMs, view.message, view.requestId);
        }
        setFailure(view);
        demo.addLog(toLogDraft("arena", view));
        return;
      }
      const view = interpretDecide("arena", { ok: true, data: result.data.verdict });
      if (view.kind === "auth") {
        demo.lock("arena");
        return;
      }
      const meta = fixtureMeta(result.data.attack.prompt);
      setFailure(null);
      setRounds((current) => [
        ...current,
        {
          response: result.data,
          view,
          fixtureId: meta.id,
          category: meta.category,
        },
      ]);
      setHistory((current) =>
        capHistory([
          ...current,
          { prompt: result.data.attack.prompt, verdict: result.data.verdict },
        ]),
      );
      demo.addLog(toLogDraft("arena", view));
    });
  }

  const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 }).format(
    rate.ratio,
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4" aria-label="Arena rounds">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-100">
            Fail closed
          </span>
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300">
            {demo.liveArena ? "Live attacker" : "Fixture replay"}
          </span>
        </div>
        <p className="text-sm leading-6 text-slate-300">
          {demo.liveArena
            ? `Live mode sends prior rounds to the arena route. History is capped at ${LIMITS.maxHistoryRounds} entries.`
            : "Fixture replay walks the synthetic prompts in fixtures/arena-attacks.json and judges each one. The live attacker stays off unless the public feature flag is set."}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Rounds" value={`${history.length} / ${LIMITS.maxHistoryRounds}`} />
          <Stat label="Blocked" value={`${rate.blocked}`} />
          <Stat label="Block rate" value={history.length === 0 ? "—" : percent} />
        </div>
        <p className="text-xs leading-5 text-slate-400">
          A round counts toward the block rate when its outcome is block.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            data-testid="run-round"
            onClick={runRound}
            disabled={isPending || demo.cooling || full}
            aria-busy={isPending}
            className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
          >
            {isPending ? "Running round…" : "Run next round"}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-white/15 px-4 py-2 text-sm text-slate-100 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            Reset arena
          </button>
        </div>
        {full ? (
          <p className="text-sm text-slate-300">
            This session reached the history cap of {LIMITS.maxHistoryRounds} rounds. Reset to start
            again.
          </p>
        ) : null}
        {failure ? (
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-200">Latest round did not complete</h3>
            <OutcomeView model={failure} tab="arena" remainingMs={demo.remainingMs} />
          </div>
        ) : null}
        {rounds.length === 0 ? (
          <p className="text-sm text-slate-400">No rounds yet.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {rounds.map((round) => (
              <li
                key={`${round.response.round}-${round.response.verdict.requestId}`}
                className="rounded-xl border border-white/10 bg-[#0c1424] p-4"
              >
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Round {round.response.round}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {round.fixtureId ? `${round.fixtureId} · ${round.category}` : "Attack prompt"}
                  </p>
                </div>
                <h4 className="text-xs font-medium tracking-wide text-slate-400 uppercase">
                  Attack prompt
                </h4>
                <p className="mt-1 text-sm leading-6 whitespace-pre-wrap break-words text-slate-100">
                  {round.response.attack.prompt}
                </p>
                <div className="mt-4">
                  <OutcomeView model={round.view} tab="arena" remainingMs={demo.remainingMs} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="border-t border-white/10 pt-6" aria-label="Judge a single prompt">
        <h3 className="text-base font-semibold text-slate-50">Judge a single prompt</h3>
        <div className="mt-4">
          <ArenaJudgeForm />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0c1424] px-3 py-2">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-mono text-lg text-slate-50">{value}</p>
    </div>
  );
}
