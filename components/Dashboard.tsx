"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import Link from "next/link";
import { TABS, type Tab } from "@/lib/contract";
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

export function Dashboard({
  tab,
  onSelectTab,
  onOverview,
}: {
  tab: Tab;
  onSelectTab: (tab: Tab) => void;
  onOverview: () => void;
}) {
  const demo = useDemo();

  function onOverviewClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onOverview();
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
    onSelectTab(id);
    document.getElementById(`tab-${id}`)?.focus();
  }

  return (
    <div className="mx-auto flex w-full max-w-[75rem] flex-1 flex-col px-5 py-6 sm:px-8 sm:py-8">
      <a
        href="#decision-main"
        className="btn-primary sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      <header className="flex flex-col gap-10">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-hairline pb-4">
          <p className="eyebrow">Decision-1 Security Demo</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/"
              data-testid="overview-link"
              onClick={onOverviewClick}
              className="nav-link"
            >
              Overview
            </Link>
            <MockScenarioControl />
          </div>
        </div>
        <div>
          <h1 className="display-lg text-balance">Security decision console</h1>
          <p className="lede mt-4 max-w-2xl text-pretty">
            Synthetic samples only. Model text is shown as plain text. Confidence is what the
            model reported, not a calibrated probability.
          </p>
        </div>
      </header>

      {demo.cooling && demo.cooldown ? (
        <div className="mt-8">
          <CooldownNotice remainingMs={demo.remainingMs} message={demo.cooldown.message} />
        </div>
      ) : null}

      <div className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
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
                  onClick={() => onSelectTab(id)}
                  className={selected ? "btn-primary" : "btn-outline"}
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
            className="surface-card mt-6 p-5 sm:p-7"
          >
            <h2 className="display-sm">{TAB_LABELS[tab]}</h2>
            <div className="mt-6">
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
