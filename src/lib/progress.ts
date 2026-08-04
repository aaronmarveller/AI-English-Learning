"use client";

import { useSyncExternalStore } from "react";

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

function readFromStorage(): readonly StepId[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as PersistedState).completed)
    ) {
      return [];
    }
    return (parsed as PersistedState).completed.filter(isStepId);
  } catch {
    // Corrupt or inaccessible storage (e.g. private browsing) — fall back
    // to a clean slate rather than throwing.
    return [];
  }
}

function writeToStorage(completed: readonly StepId[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedState = { completed: [...completed] };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore write failures (storage full / disabled) — progress just
    // won't survive a refresh in that case.
  }
}

// --- Module-level store -----------------------------------------------
// A tiny external store (subscribe/getSnapshot) rather than a full state
// library: six booleans don't need zustand. useSyncExternalStore gives us
// correct SSR behavior (getServerSnapshot below) and lets every consumer
// (header dots, debug bar, guards) stay in sync without prop-drilling.

let snapshot: readonly StepId[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  snapshot = readFromStorage();
  hydrated = true;
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  ensureHydrated();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): readonly StepId[] {
  ensureHydrated();
  return snapshot;
}

// A single stable reference — useSyncExternalStore requires getServerSnapshot
// to return a cached value (a fresh `[]` literal on every call is a *new*
// array each time, which reads as "always changed" and can trigger a
// render loop).
const EMPTY_COMPLETED: readonly StepId[] = [];

function getServerSnapshot(): readonly StepId[] {
  return EMPTY_COMPLETED;
}

/** Marks `step` complete and persists it. Safe to call multiple times. */
export function markStepComplete(step: StepId): void {
  ensureHydrated();
  if (snapshot.includes(step)) return;
  snapshot = [...snapshot, step];
  writeToStorage(snapshot);
  emit();
}

/** Clears all progress (e.g. for a future "retry lesson" flow). */
export function resetProgress(): void {
  ensureHydrated();
  snapshot = [];
  writeToStorage(snapshot);
  emit();
}

export function isStepComplete(step: StepId, completed: readonly StepId[] = getSnapshot()): boolean {
  return completed.includes(step);
}

/**
 * A step is unlocked once the step immediately before it is complete.
 * `observe` (index 0) has no prerequisite and is always unlocked.
 */
export function isStepUnlocked(step: StepId, completed: readonly StepId[] = getSnapshot()): boolean {
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
  const completed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    completed,
    isStepComplete: (step: StepId) => isStepComplete(step, completed),
    isStepUnlocked: (step: StepId) => isStepUnlocked(step, completed),
    markStepComplete,
    resetProgress,
  };
}
