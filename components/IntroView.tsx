import type { Tab } from "@/lib/contract";
import { INTRO_USE_CASES } from "@/components/intro-content";
import { MockScenarioControl } from "@/components/MockScenarioControl";

type IntroViewProps = {
  onStart: () => void;
  onTry: (tab: Tab) => void;
};

export function IntroView({ onStart, onTry }: IntroViewProps) {
  return (
    <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6">
      <a
        href="#use-cases"
        className="sr-only rounded-md bg-cyan-300 px-3 py-2 text-slate-950 focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Skip to use cases
      </a>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-cyan-200 uppercase">
            Decision-1 Security Demo
          </p>
          <h1
            id="intro-heading"
            tabIndex={-1}
            className="mt-2 text-2xl font-semibold tracking-tight text-slate-50 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200 sm:text-3xl"
          >
            Microsoft Decision-1 on Azure Foundry
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Returns typed, calibrated decisions. Five use cases show the decision type and the
            rule for acting on it. All inputs are synthetic presets.
          </p>
          <button
            type="button"
            data-testid="start-demo"
            onClick={onStart}
            className="mt-5 rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Start demo
          </button>
        </div>
        <MockScenarioControl />
      </header>

      <section id="use-cases" aria-labelledby="use-cases-heading" className="mt-6" data-testid="intro">
        <h2 id="use-cases-heading" className="text-lg font-semibold text-slate-50">
          Use cases
        </h2>
        <ul className="m-0 mt-4 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {INTRO_USE_CASES.map((useCase) => {
            const titleId = `use-case-${useCase.id}-title`;
            return (
              <li key={useCase.id} className="min-w-0">
                <article
                  aria-labelledby={titleId}
                  data-testid={`use-case-${useCase.id}`}
                  className="flex h-full flex-col rounded-2xl border border-white/10 bg-[#10192b] p-4 sm:p-5"
                >
                  <h3 id={titleId} className="text-lg font-semibold text-slate-50">
                    {useCase.title}
                  </h3>
                  <p className="mt-2 text-xs font-medium tracking-wide text-cyan-200 uppercase">
                    Decision type: {useCase.decisionType}
                  </p>
                  <p className="mt-3 flex-1 text-sm leading-6 text-slate-300">{useCase.explanation}</p>
                  <button
                    type="button"
                    data-testid={`try-${useCase.id}`}
                    onClick={() => onTry(useCase.id)}
                    className="mt-4 inline-flex w-fit rounded-full bg-white/5 px-3 py-1.5 text-sm font-medium text-cyan-50 ring-1 ring-cyan-300/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 hover:bg-white/10"
                  >
                    Try it
                    <span className="sr-only"> {useCase.title}</span>
                  </button>
                </article>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
