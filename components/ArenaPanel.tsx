"use client";

import { useState, useTransition } from "react";
import { LIMITS, type ArenaHistoryEntry, type ArenaRoundResponse } from "@/lib/contract";
import { submitArenaRound } from "@/lib/api-client";
import { arenaFixtures, blockRate, capHistory } from "@/lib/arena-session";
import { interpretDecide, toLogDraft, type ViewModel } from "@/lib/interpret";
import { roundTripMs } from "@/lib/latency";
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
    const started = performance.now();
    startTransition(async () => {
      const result = await submitArenaRound(snapshot, demo.scenario);
      const timing = { totalMs: roundTripMs(started), modelMs: result.modelMs ?? null };
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
        demo.addLog(toLogDraft("arena", view), timing);
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
      demo.addLog(toLogDraft("arena", view), timing);
    });
  }

  const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 }).format(
    rate.ratio,
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4" aria-label="Arena rounds">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge verdict-danger">Fail closed</span>
          <span className="badge">{demo.liveArena ? "Live attacker" : "Fixture replay"}</span>
        </div>
        <p className="lede">
          {demo.liveArena
            ? `Live mode sends prior rounds to the arena route. History is capped at ${LIMITS.maxHistoryRounds} entries.`
            : "Fixture replay walks the synthetic prompts in fixtures/arena-attacks.json and judges each one. The live attacker stays off unless the public feature flag is set."}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Rounds" value={`${history.length} / ${LIMITS.maxHistoryRounds}`} />
          <Stat label="Blocked" value={`${rate.blocked}`} />
          <Stat label="Block rate" value={history.length === 0 ? "—" : percent} />
        </div>
        <p className="text-xs leading-5 text-muted">
          A round counts toward the block rate when its outcome is block.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            data-testid="run-round"
            onClick={runRound}
            disabled={isPending || demo.cooling || full}
            aria-busy={isPending}
            className="btn-primary"
          >
            {isPending ? "Running round…" : "Run next round"}
          </button>
          <button
            type="button"
            onClick={reset}
            className="btn-outline"
          >
            Reset arena
          </button>
        </div>
        {full ? (
          <p className="lede">
            This session reached the history cap of {LIMITS.maxHistoryRounds} rounds. Reset to start
            again.
          </p>
        ) : null}
        {failure ? (
          <div>
            <h3 className="title mb-2">Latest round did not complete</h3>
            <OutcomeView model={failure} tab="arena" remainingMs={demo.remainingMs} />
          </div>
        ) : null}
        {rounds.length === 0 ? (
          <p className="lede">No rounds yet.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {rounds.map((round) => (
              <li
                key={`${round.response.round}-${round.response.verdict.requestId}`}
                className="surface-card-quiet p-5"
              >
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="title">Round {round.response.round}</h3>
                  <p className="text-xs text-muted">
                    {round.fixtureId ? `${round.fixtureId} · ${round.category}` : "Attack prompt"}
                  </p>
                </div>
                <h4 className="eyebrow">Attack prompt</h4>
                <p className="lede mt-2 whitespace-pre-wrap break-words">
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
      <section className="border-t border-hairline pt-8" aria-label="Judge a single prompt">
        <h3 className="display-sm">Judge a single prompt</h3>
        <div className="mt-4">
          <ArenaJudgeForm />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card-quiet px-4 py-3">
      <p className="eyebrow">{label}</p>
      <p className="display-sm mt-2">{value}</p>
    </div>
  );
}
