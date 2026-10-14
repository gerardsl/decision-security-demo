"use client";

import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { TABS, type Tab } from "@/lib/contract";
import { tabReturnPath } from "@/lib/return-to";
import { ArenaPanel } from "@/components/ArenaPanel";
import { CooldownNotice } from "@/components/CooldownNotice";
import { useDemo } from "@/components/demo-context";
import { MockScenarioControl } from "@/components/MockScenarioControl";
import { PanelBoundary } from "@/components/PanelBoundary";
import { DlpPanel, McpPanel, PhishingPanel, SocPanel } from "@/components/panels";
import { RequestLog } from "@/components/RequestLog";

const TAB_LABELS: Record<Tab, string> = {
  phishing: "Phishing triage",
  soc: "SOC alert router",
  mcp: "MCP tool-call guardrail",
  dlp: "DLP for AI prompts",
  arena: "Red vs Blue arena",
};

export function Dashboard({ initialTab }: { initialTab: Tab }) {
  const demo = useDemo();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);

  function selectTab(id: Tab) {
    setTab(id);
    router.replace(tabReturnPath(id), { scroll: false });
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.indexOf(tab);
    if (index < 0) return;
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    const id = TABS[next];
    if (!id) return;
    selectTab(id);
    document.getElementById(`tab-${id}`)?.focus();
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6">
      <a
        href="#decision-main"
        className="sr-only rounded-md bg-cyan-300 px-3 py-2 text-slate-950 focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-cyan-200 uppercase">
            Decision-1 Security Demo
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
            Security decision console
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Synthetic samples only. Model text is shown as plain text. Confidence is what the
            model reported, not a calibrated probability.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <MockScenarioControl />
        </div>
      </header>

      {demo.cooling && demo.cooldown ? (
        <div className="mt-4">
          <CooldownNotice remainingMs={demo.remainingMs} message={demo.cooldown.message} />
        </div>
      ) : null}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section id="decision-main">
          <div
            role="tablist"
            aria-label="Decision demos"
            className="flex flex-wrap gap-2"
            onKeyDown={onTabKeyDown}
          >
            {TABS.map((id) => {
              const selected = id === tab;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`tab-${id}`}
                  data-testid={`tab-${id}`}
                  aria-selected={selected}
                  aria-controls={`panel-${id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => selectTab(id)}
                  className={`rounded-full px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 ${
                    selected
                      ? "bg-cyan-300/15 text-cyan-50 ring-1 ring-cyan-300/50"
                      : "bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {TAB_LABELS[id]}
                </button>
              );
            })}
          </div>
          <div
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            className="mt-5 rounded-2xl border border-white/10 bg-[#10192b] p-4 sm:p-5"
          >
            <h2 className="text-lg font-semibold text-slate-50">{TAB_LABELS[tab]}</h2>
            <div className="mt-4">
              <PanelBoundary key={tab} title={TAB_LABELS[tab]}>
                {tab === "phishing" ? <PhishingPanel /> : null}
                {tab === "soc" ? <SocPanel /> : null}
                {tab === "mcp" ? <McpPanel /> : null}
                {tab === "dlp" ? <DlpPanel /> : null}
                {tab === "arena" ? <ArenaPanel /> : null}
              </PanelBoundary>
            </div>
          </div>
        </section>
        <RequestLog />
      </div>
    </div>
  );
}
