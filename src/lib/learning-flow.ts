"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { createPersistedStore } from "@/lib/create-persisted-store";
import { useDebugFlag } from "@/lib/debug";

/**
 * Learning Flow: the single owner of "where does Continue go" for the 6-step
 * Lesson (Home doesn't count as a step).
 *
 * Pure core: `flowAt` answers, for a step + the completed steps + the debug
 * flag, the previous / next destination (including entry from Home and exit
 * after Review) and whether the step is unlocked. `completionRoute`,
 * `entryRoute` and `debugJumpLinks` are the other pure answers. STEP_IDS
 * defines the order: progress dots, the unlock chain (a step unlocks once the
 * step immediately before it is complete; the first is always unlocked) and
 * every route follow from it. No caller hardcodes a step route.
 *
 * Command / hook: `completeStep` marks a step complete and returns the next
 * route; `useLearningFlow` subscribes to the persisted store and reads the
 * pathname + debug flag. The store is internal; its localStorage key is
 * unchanged from the old progress module so existing progress survives. The
 * singleton / hydration / listener wiring lives in
 * src/lib/create-persisted-store.ts (shared with src/lib/practice-state.ts).
 */

export const STEP_IDS = [
  "observe",
  "notice",
  "explore",
  "guided-practice",
  "practice",
  "review",
] as const;

export type StepId = (typeof STEP_IDS)[number];

export const STEP_LABELS: Record<StepId, string> = {
  observe: "Observe",
  explore: "Explore",
  notice: "Notice",
  "guided-practice": "Guided Practice",
  practice: "Practice",
  review: "Learning Summary",
};

const HOME_ROUTE = "/";
const EXIT_ROUTE = "/coming-soon";

function routeOf(step: StepId): string {
  return `/${step}`;
}

const STORAGE_KEY = "greeting-somebody:progress";

type PersistedState = {
  completed: StepId[];
};

function isStepId(value: unknown): value is StepId {
  return typeof value === "string" && (STEP_IDS as readonly string[]).includes(value);
}

// A single stable reference — useSyncExternalStore requires getServerSnapshot
// to return a cached value (a fresh `[]` literal on every call reads as
// "always changed" and can trigger a render loop). createPersistedStore
// returns this exact reference from its getServerSnapshot.
const EMPTY_COMPLETED: readonly StepId[] = [];

function deserialize(raw: string): readonly StepId[] {
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as PersistedState).completed)
  ) {
    return EMPTY_COMPLETED;
  }
  return (parsed as PersistedState).completed.filter(isStepId);
}

function serialize(completed: readonly StepId[]): string {
  const payload: PersistedState = { completed: [...completed] };
  return JSON.stringify(payload);
}

const store = createPersistedStore<readonly StepId[]>({
  storageKey: STORAGE_KEY,
  initialState: EMPTY_COMPLETED,
  serialize,
  deserialize,
});

/** The route that follows `step` (the exit after the last step). */
export function completionRoute(step: StepId): string {
  const next = STEP_IDS[STEP_IDS.indexOf(step) + 1];
  return next ? routeOf(next) : EXIT_ROUTE;
}

/** Where Home's Start goes: the first step. */
export function entryRoute(): string {
  return routeOf(STEP_IDS[0]);
}

/** Marks `step` complete, persists it, and returns the route Continue goes to. */
export function completeStep(step: StepId): string {
  const current = store.getSnapshot();
  if (!current.includes(step)) store.persist([...current, step]);
  return completionRoute(step);
}

export type Flow = {
  step: StepId | null;
  /** Destination of "Back": the previous step, or Home from the first. Null outside the flow. */
  prev: string | null;
  /** Destination after this step: the next step, or the exit after the last. Null outside the flow. */
  next: string | null;
  /** Debug bypasses the unlock rule; paths outside the flow are always open. */
  unlocked: boolean;
};

/** Pure core: the navigation facts for `step` given what is completed. */
export function flowAt(
  step: StepId | null,
  completed: readonly StepId[],
  { debug }: { debug: boolean },
): Flow {
  if (step === null) return { step, prev: null, next: null, unlocked: true };
  const index = STEP_IDS.indexOf(step);
  const before = STEP_IDS[index - 1];
  return {
    step,
    prev: before ? routeOf(before) : HOME_ROUTE,
    next: completionRoute(step),
    unlocked: debug || index === 0 || completed.includes(before),
  };
}

export type JumpLink = { label: string; href: string };

/** Debug jump bar targets: Home, then every step with the debug flag carried. */
export function debugJumpLinks(): JumpLink[] {
  return [
    { label: "Home", href: HOME_ROUTE },
    ...STEP_IDS.map((step) => ({ label: STEP_LABELS[step], href: `${routeOf(step)}?debug=1` })),
  ];
}

function stepFromPathname(pathname: string): StepId | null {
  return STEP_IDS.find((step) => pathname === routeOf(step)) ?? null;
}

/**
 * React hook: subscribes to the store, reads pathname + debug flag, and
 * returns `flowAt` for the current page plus the completed steps (for the
 * progress dots). `getServerSnapshot` is an empty list so server render and
 * the first hydration pass agree (no hydration mismatch).
 */
export function useLearningFlow(): Flow & { completed: readonly StepId[] } {
  const completed = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const debug = useDebugFlag();
  const step = stepFromPathname(usePathname());
  return { ...flowAt(step, completed, { debug }), completed };
}
