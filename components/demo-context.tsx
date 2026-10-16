"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Tab } from "@/lib/contract";
import { isArenaLive, isMockEnabled } from "@/lib/flags";
import type { ClientTiming } from "@/lib/latency";
import type { LogDraft } from "@/lib/interpret";
import { MOCK_SCENARIOS, type MockScenario } from "@/lib/mock-api";
import { loginPathForTab } from "@/lib/return-to";

export type LogEntry = LogDraft & {
  localId: string;
  at: string;
  totalMs: number | null;
  modelMs: number | null;
  modelStatus: string | null;
};

type Cooldown = {
  until: number;
  message: string;
  requestId: string | null;
};

type DemoContextValue = {
  mock: boolean;
  liveArena: boolean;
  scenario: MockScenario;
  setScenario: (scenario: MockScenario) => void;
  entries: readonly LogEntry[];
  addLog: (draft: LogDraft, timing: ClientTiming) => void;
  clearLog: () => void;
  clearSession: () => void;
  lock: (tab: Tab) => void;
  cooldown: Cooldown | null;
  now: number;
  cooling: boolean;
  remainingMs: number;
  startCooldown: (retryAfterMs: number, message: string, requestId: string | null) => void;
};

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [scenario, setScenario] = useState<MockScenario>("nominal");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [cooldown, setCooldown] = useState<Cooldown | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= cooldown.until) setCooldown(null);
    };
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const clearLog = useCallback(() => {
    setEntries([]);
  }, []);

  const clearSession = useCallback(() => {
    setEntries([]);
    setCooldown(null);
  }, []);

  const lock = useCallback(
    (tab: Tab) => {
      clearSession();
      router.push(loginPathForTab(tab));
    },
    [clearSession, router],
  );

  const addLog = useCallback((draft: LogDraft, timing: ClientTiming) => {
    setEntries((current) =>
      [
        {
          ...draft,
          totalMs: timing.totalMs,
          modelMs: timing.modelMs,
          modelStatus: timing.modelStatus,
          localId: crypto.randomUUID(),
          at: new Date().toISOString(),
        },
        ...current,
      ].slice(0, 50),
    );
  }, []);

  const startCooldown = useCallback(
    (retryAfterMs: number, message: string, requestId: string | null) => {
      if (retryAfterMs <= 0) return;
      const until = Date.now() + retryAfterMs;
      setCooldown({ until, message, requestId });
      setNow(Date.now());
    },
    [],
  );

  const remainingMs = cooldown ? Math.max(0, cooldown.until - now) : 0;
  const cooling = cooldown !== null && remainingMs > 0;

  const value = useMemo<DemoContextValue>(
    () => ({
      mock: isMockEnabled(),
      liveArena: isArenaLive(),
      scenario,
      setScenario,
      entries,
      addLog,
      clearLog,
      clearSession,
      lock,
      cooldown,
      now,
      cooling,
      remainingMs,
      startCooldown,
    }),
    [
      scenario,
      entries,
      addLog,
      clearLog,
      clearSession,
      lock,
      cooldown,
      now,
      cooling,
      remainingMs,
      startCooldown,
    ],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const value = useContext(DemoContext);
  if (!value) {
    throw new Error("DemoProvider is missing.");
  }
  return value;
}

export function isMockScenario(value: string): value is MockScenario {
  return (MOCK_SCENARIOS as readonly string[]).includes(value);
}
