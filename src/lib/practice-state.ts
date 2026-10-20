"use client";

import { useSyncExternalStore } from "react";
import type { CallLine } from "@/lib/call-engine";
import { createPersistedStore } from "@/lib/create-persisted-store";
import {
  canStartCall as canStartCallIn,
  endCall as endCallIn,
  canViewLearningSummary,
  loadPractice,
  replaceCallLines,
  startCall as startCallIn,
  startOver,
  type CallRecord,
  type PracticeState,
} from "@/lib/practice";

/**
 * Practice store: the localStorage adapter and hook over the Practice module
 * (src/lib/practice.ts), which owns every rule and transition. The storage key
 * and on-disk shape are the same as ever, so saved Practice survives.
 */

const STORAGE_KEY = "greeting-somebody:practice";

// A single stable reference — useSyncExternalStore requires getServerSnapshot
// to return a cached value. Never mutated in place.
const INITIAL_STATE: PracticeState = startOver();

/**
 * Loading ends any Call a reload cut off (loadPractice); when that changed
 * what is saved, the settled state is written straight back so storage never
 * keeps an over Call as live.
 */
function loadAndSettle(raw: string): PracticeState {
  const loaded = loadPractice(raw);
  const settled = JSON.stringify(loaded);
  if (settled !== raw) {
    try {
      window.localStorage.setItem(STORAGE_KEY, settled);
    } catch {
      // Storage unavailable: the settled state just won't be saved.
    }
  }
  return loaded;
}

const store = createPersistedStore<PracticeState>({
  storageKey: STORAGE_KEY,
  initialState: INITIAL_STATE,
  serialize: (state) => JSON.stringify(state),
  deserialize: loadAndSettle,
});

// --- Actions --------------------------------------------------------------

let callIdCounter = 0;

/** Whether another Call may still start (read from the store, not a hook). */
export function canStartCall(): boolean {
  return canStartCallIn(store.getSnapshot());
}

/** Records a connected Call and returns its id, or null when all three are used. */
export function startCall(): string | null {
  callIdCounter += 1;
  const id = `call-${Date.now()}-${callIdCounter}`;
  const next = startCallIn(store.getSnapshot(), id);
  if (next === null) return null;
  store.persist(next);
  return id;
}

/** Saves the Call's bubbles as they change. */
export function updateCallLines(id: string, lines: readonly CallLine[]): void {
  store.persist(replaceCallLines(store.getSnapshot(), id, lines));
}

/** Marks the Call as over, keeping only bubbles that carry text. */
export function endCall(id: string, lines: readonly CallLine[]): void {
  store.persist(endCallIn(store.getSnapshot(), id, lines));
}

/** Starts Practice over from Review: three Calls again, no transcripts. */
export function resetPractice(): void {
  store.persist(startOver());
}

export function usePractice() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const latest: CallRecord | null = state.calls[state.calls.length - 1] ?? null;
  return {
    state,
    calls: state.calls,
    callsUsed: state.calls.length,
    canStartCall: canStartCallIn(state),
    latestCall: latest,
    canViewLearningSummary: canViewLearningSummary(state),
  };
}
