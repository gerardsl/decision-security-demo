import type { Tab } from "@/lib/contract";
import { INTRO_USE_CASES } from "@/components/intro-content";
import { MockScenarioControl } from "@/components/MockScenarioControl";

type IntroViewProps = {
  onStart: () => void;
  onTry: (tab: Tab) => void;
};

export function IntroView({ onStart, onTry }: IntroViewProps) {
  return (
    <div className="relative mx-auto flex w-full max-w-[75rem] flex-1 flex-col px-5 pt-6 pb-16 sm:px-8 sm:pt-8 lg:pb-24">
      <a
        href="#use-cases"
        className="btn-primary sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to use cases
      </a>
      <header className="flex flex-col">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 border-b border-hairline pb-4">
          <p className="eyebrow">Decision-1 Security Demo</p>
          <MockScenarioControl />
        </div>
        <div className="max-w-3xl pt-14 sm:pt-20 lg:pt-24">
          <h1
            id="intro-heading"
            tabIndex={-1}
            className="display-mega text-balance outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
          >
            Microsoft Decision-1 on Azure Foundry
          </h1>
          <p className="lede mt-6 max-w-xl text-pretty">
            Returns typed, calibrated decisions. Five use cases show the decision type and the
            rule for acting on it. All inputs are synthetic presets.
          </p>
          <button type="button" data-testid="start-demo" onClick={onStart} className="btn-primary mt-8">
            Start demo
          </button>
        </div>
      </header>

      <section id="use-cases" aria-labelledby="use-cases-heading" className="mt-16 lg:mt-24" data-testid="intro">
        <h2 id="use-cases-heading" className="display-lg">
          Use cases
        </h2>
        <ul className="m-0 mt-8 grid list-none gap-4 p-0 sm:grid-cols-2 lg:gap-6 xl:grid-cols-3">
          {INTRO_USE_CASES.map((useCase) => {
            const titleId = `use-case-${useCase.id}-title`;
            return (
              <li key={useCase.id} className="min-w-0">
                <article
                  aria-labelledby={titleId}
                  data-testid={`use-case-${useCase.id}`}
                  className="surface-card flex h-full flex-col p-6 sm:p-7"
                >
                  <h3 id={titleId} className="display-sm">
                    {useCase.title}
                  </h3>
                  <p className="eyebrow mt-4">Decision type: {useCase.decisionType}</p>
                  <p className="lede mt-4 flex-1">{useCase.explanation}</p>
                  <button
                    type="button"
                    data-testid={`try-${useCase.id}`}
                    onClick={() => onTry(useCase.id)}
                    className="btn-outline mt-6"
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
