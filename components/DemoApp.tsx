"use client";

import type { Tab } from "@/lib/contract";
import { Dashboard } from "@/components/Dashboard";
import { DemoProvider } from "@/components/demo-context";

export function DemoApp({ initialTab = "phishing" }: { initialTab?: Tab }) {
  return (
    <DemoProvider>
      <Dashboard initialTab={initialTab} />
    </DemoProvider>
  );
}
