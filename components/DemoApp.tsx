"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TABS, type Tab } from "@/lib/contract";
import { tabReturnPath } from "@/lib/return-to";
import { Dashboard } from "@/components/Dashboard";
import { DemoProvider } from "@/components/demo-context";
import { IntroView } from "@/components/IntroView";

export function DemoApp({ initialTab = null }: { initialTab?: Tab | null }) {
  return (
    <DemoProvider>
      <Console initialTab={initialTab ?? null} />
    </DemoProvider>
  );
}

function hrefFor(tab: Tab | null): string {
  return tab === null ? "/" : tabReturnPath(tab);
}

function Console({ initialTab }: { initialTab: Tab | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab | null>(initialTab);
  const [prevInitialTab, setPrevInitialTab] = useState(initialTab);
  const [expectedHref, setExpectedHref] = useState<string | null>(null);
  const focusTarget = useRef<Tab | "overview" | null>(null);

  if (initialTab !== prevInitialTab) {
    setPrevInitialTab(initialTab);
    const actual = hrefFor(initialTab);
    if (expectedHref === null || expectedHref === actual) {
      setExpectedHref(null);
      setTab(initialTab);
    }
  }

  useEffect(() => {
    const target = focusTarget.current;
    if (target === null) return;
    focusTarget.current = null;
    const id = target === "overview" ? "intro-heading" : `tab-${target}`;
    document.getElementById(id)?.focus();
  }, [tab]);

  function go(next: Tab | null, history: "push" | "replace") {
    const href = hrefFor(next);
    setExpectedHref(href);
    focusTarget.current = next === null ? "overview" : next;
    setTab(next);
    if (history === "push") router.push(href);
    else router.replace(href, { scroll: false });
  }

  function openTab(id: Tab) {
    go(id, tab === null ? "push" : "replace");
  }

  if (tab === null) {
    const first = TABS[0];
    return (
      <IntroView
        onStart={() => {
          if (first) openTab(first);
        }}
        onTry={openTab}
      />
    );
  }

  return (
    <Dashboard
      tab={tab}
      onSelectTab={openTab}
      onOverview={() => go(null, "push")}
    />
  );
}
