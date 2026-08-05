/**
 * Shared skeleton for a localStorage-backed external store, factored out of
 * src/lib/progress.ts and src/lib/practice-state.ts (ticket 07 — those two
 * modules independently hand-rolled the exact same
 * singleton-snapshot + hydrated-flag + listeners-Set + try/catch
 * localStorage read/write boilerplate under useSyncExternalStore).
 *
 * This factory owns only the mechanical part: hydration timing, listener
 * bookkeeping, the stable getServerSnapshot reference, and the try/catch
 * around localStorage access. It deliberately knows nothing about *shape*
 * validation — each store still supplies its own `serialize`/`deserialize`,
 * which is where real domain logic like `isStepId`/`isPracticeMessage`
 * corrupt-storage recovery lives (that's correctness logic, not boilerplate,
 * and stays per-store).
 *
 * Not a general state-management library — just enough for "a few small
 * pieces of client state that need to survive a refresh and be readable
 * outside React." Reach for something heavier if a future store needs more
 * than this.
 */

export type PersistedStoreConfig<T> = {
  /** localStorage key. Must be unique per store — see each call site for its value. */
  storageKey: string;
  /**
   * The value used both as the pre-hydration in-memory snapshot and as the
   * fixed `getServerSnapshot` return. Must never be mutated in place —
   * every update should flow through `persist`, which always installs a new
   * value, so this reference stays stable for as long as nothing has been
   * persisted yet (see the getServerSnapshot note below).
   */
  initialState: T;
  /** Turns a snapshot into the exact string written to localStorage. */
  serialize: (state: T) => string;
  /**
   * Turns a raw localStorage string back into a snapshot. May throw (e.g.
   * `JSON.parse` on malformed data) — the factory catches that and falls
   * back to `initialState`. For validation short of a hard parse failure
   * (wrong shape, unexpected field types), return a sanitized/fallback `T`
   * instead of throwing; that's normal recovery, not exceptional.
   */
  deserialize: (raw: string) => T;
};

export type PersistedStore<T> = {
  /** Hydrates the in-memory snapshot from localStorage exactly once. Safe to call repeatedly and safe to call during SSR (no-ops without `window`). */
  ensureHydrated: () => void;
  /** Current snapshot, hydrating first if needed. Safe to call from outside React. */
  getSnapshot: () => T;
  /**
   * Fixed reference for useSyncExternalStore's third argument. Always
   * `initialState` itself — a single stable reference, never a fresh
   * literal — so server render and the first client hydration pass agree
   * (no hydration mismatch, and no render loop from a "new" value every
   * call). Callers don't need to remember this; the factory guarantees it
   * structurally.
   */
  getServerSnapshot: () => T;
  /** Subscribes to snapshot changes; returns an unsubscribe function. Hydrates on first call. */
  subscribe: (listener: () => void) => () => void;
  /** Installs `next` as the new snapshot, writes it through to localStorage, and notifies listeners. */
  persist: (next: T) => void;
};

/**
 * Builds a tiny external store (subscribe/getSnapshot/getServerSnapshot +
 * persist) suitable for `useSyncExternalStore`, backed by a single
 * localStorage key. See src/lib/progress.ts and src/lib/practice-state.ts
 * for the two call sites and how they layer their own validated
 * serialize/deserialize on top.
 */
export function createPersistedStore<T>({
  storageKey,
  initialState,
  serialize,
  deserialize,
}: PersistedStoreConfig<T>): PersistedStore<T> {
  function readFromStorage(): T {
    if (typeof window === "undefined") return initialState;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === null) return initialState;
      return deserialize(raw);
    } catch {
      // Corrupt or inaccessible storage (e.g. private browsing) — fall back
      // to a clean slate rather than throwing.
      return initialState;
    }
  }

  function writeToStorage(state: T): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, serialize(state));
    } catch {
      // Ignore write failures (storage full / disabled) — state just won't
      // survive a refresh in that case.
    }
  }

  let snapshot: T = initialState;
  let hydrated = false;
  const listeners = new Set<() => void>();

  function ensureHydrated(): void {
    if (hydrated || typeof window === "undefined") return;
    snapshot = readFromStorage();
    hydrated = true;
  }

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function subscribe(listener: () => void): () => void {
    ensureHydrated();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function getSnapshot(): T {
    ensureHydrated();
    return snapshot;
  }

  function getServerSnapshot(): T {
    return initialState;
  }

  function persist(next: T): void {
    snapshot = next;
    writeToStorage(next);
    emit();
  }

  return { ensureHydrated, getSnapshot, getServerSnapshot, subscribe, persist };
}
