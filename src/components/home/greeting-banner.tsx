"use client";

import { useSyncExternalStore } from "react";

/**
 * Time-of-day greeting (spec.md user story 11: "打开就看到按我当地时间变化的问候语").
 * Boundaries: <12:00 morning, 12:00–18:00 afternoon, >=18:00 evening — the
 * spec doesn't mandate exact cutoffs, these are the suggested ones.
 *
 * Reads the learner's *local* browser time via `new Date()`, which can only
 * be known client-side — the same category of problem src/lib/progress.ts
 * and src/lib/debug.ts solve with a useSyncExternalStore-backed store
 * rather than useState+useEffect, so this follows the same pattern instead
 * of calling setState from inside an effect (which react-hooks/
 * set-state-in-effect in this repo's eslint config flags as an error).
 * `getServerSnapshot` returns null so server render and first hydration
 * agree (a blank placeholder); React then corrects to the real,
 * client-computed period immediately after mount, the same "hasMounted"
 * correction src/lib/use-has-mounted.ts documents.
 *
 * The computed period is cached at module scope after its first read: the
 * requirement is only that the greeting is correct "on load", not that it
 * live-updates if the tab is left open across an hour boundary, and a full
 * page navigation (the only way this module re-initializes) naturally
 * resets the cache.
 */

type GreetingPeriod = "morning" | "afternoon" | "evening";

function periodForHour(hour: number): GreetingPeriod {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

const GREETINGS: Record<GreetingPeriod, { zh: string; en: string }> = {
  morning: { zh: "早上好", en: "Good morning" },
  afternoon: { zh: "下午好", en: "Good afternoon" },
  evening: { zh: "晚上好", en: "Good evening" },
};

let cachedPeriod: GreetingPeriod | null = null;

function subscribe(): () => void {
  // Nothing external to subscribe to — like use-has-mounted.ts, this only
  // ever needs to flip once, from the SSR default to the real client value.
  return () => {};
}

function getSnapshot(): GreetingPeriod {
  if (cachedPeriod === null) {
    cachedPeriod = periodForHour(new Date().getHours());
  }
  return cachedPeriod;
}

function getServerSnapshot(): GreetingPeriod | null {
  return null;
}

function useGreetingPeriod(): GreetingPeriod | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function GreetingBanner() {
  const period = useGreetingPeriod();
  const greeting = period ? GREETINGS[period] : null;

  return (
    <h1 data-testid="greeting" aria-live="polite" className="text-h1">
      {greeting ? greeting.zh : " "}
    </h1>
  );
}
