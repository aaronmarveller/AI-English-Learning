"use client";

import { useSyncExternalStore } from "react";
import { createPersistedStore } from "@/lib/create-persisted-store";

/**
 * Progress store for the 5-step Learning Flow (Home doesn't count as a step).
 *
 * Persists which steps the learner has completed to localStorage, and
 * exposes both plain functions (for use outside React, e.g. route guards
 * evaluated during render) and a `useProgress()` hook (for components that
 * need to re-render when progress changes).
 *
 * Order matters: STEP_IDS defines both the progress-dot order (1-5) and the
 * unlock chain — a step is unlocked once the step immediately before it is
 * complete. `observe` has no prerequisite, so it's always unlocked from Home.
 *
 * The module-level singleton snapshot / hydration-flag / listeners /
 * useSyncExternalStore wiring live in src/lib/create-persisted-store.ts,
 * shared with src/lib/practice-state.ts (ticket 07). This module keeps only
 * what's genuinely its own: the on-disk JSON shape and the StepId-array
 * validation that recovers from corrupt storage.
 */

export const STEP_IDS = ["observe", "explore", "notice", "practice", "review"] as const;

export type StepId = (typeof STEP_IDS)[number];

export const STEP_ROUTES: Record<StepId, `/${StepId}`> = {
  observe: "/observe",
  explore: "/explore",
  notice: "/notice",
  practice: "/practice",
  review: "/review",
};

export const STEP_LABELS: Record<StepId, string> = {
  observe: "Observe",
  explore: "Explore",
  notice: "Notice",
  practice: "Practice",
  review: "Review",
};

const STORAGE_KEY = "greeting-somebody:progress";

type PersistedState = {
  completed: StepId[];
};

function isStepId(value: unknown): value is StepId {
  return typeof value === "string" && (STEP_IDS as readonly string[]).includes(value);
}

// A single stable reference — useSyncExternalStore requires getServerSnapshot
// to return a cached value (a fresh `[]` literal on every call is a *new*
// array each time, which reads as "always changed" and can trigger a
// render loop). createPersistedStore returns this exact reference from its
// getServerSnapshot, so it just has to be defined once, here.
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

/** Marks `step` complete and persists it. Safe to call multiple times. */
export function markStepComplete(step: StepId): void {
  const current = store.getSnapshot();
  if (current.includes(step)) return;
  store.persist([...current, step]);
}

/** Clears all progress (e.g. for a future "retry lesson" flow). */
export function resetProgress(): void {
  store.persist([]);
}

export function isStepComplete(
  step: StepId,
  completed: readonly StepId[] = store.getSnapshot(),
): boolean {
  return completed.includes(step);
}

/**
 * A step is unlocked once the step immediately before it is complete.
 * `observe` (index 0) has no prerequisite and is always unlocked.
 */
export function isStepUnlocked(
  step: StepId,
  completed: readonly StepId[] = store.getSnapshot(),
): boolean {
  const index = STEP_IDS.indexOf(step);
  if (index <= 0) return true;
  const prerequisite = STEP_IDS[index - 1];
  return completed.includes(prerequisite);
}

/** Maps a pathname (e.g. from usePathname()) to the StepId it represents, or null. */
export function getStepFromPathname(pathname: string): StepId | null {
  return STEP_IDS.find((step) => pathname === STEP_ROUTES[step]) ?? null;
}

/**
 * React hook: subscribes to the progress store and re-renders on change.
 * `getServerSnapshot` returns an empty list so server render and the first
 * client hydration pass agree (no hydration mismatch); React then swaps in
 * the real localStorage-backed value immediately after hydrating.
 */
export function useProgress() {
  const completed = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return {
    completed,
    isStepComplete: (step: StepId) => isStepComplete(step, completed),
    isStepUnlocked: (step: StepId) => isStepUnlocked(step, completed),
    markStepComplete,
    resetProgress,
  };
}
