"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Debug jump-bar flag: `?debug=1` on any URL activates it. The flag is
 * mirrored into sessionStorage so it survives client-side navigation to
 * routes that don't carry the query string (e.g. clicking Continue from
 * Observe to Explore shouldn't drop it). sessionStorage (not localStorage)
 * is intentional — this is a per-demo-session presenter switch, not
 * learner progress, and should reset when the tab closes.
 *
 * Implemented as a useSyncExternalStore-backed store (like src/lib/progress.ts)
 * rather than useState+useEffect: reading window.location/sessionStorage is a
 * read of external mutable state, which is exactly what useSyncExternalStore
 * is for — it also gives correct, mismatch-free SSR/hydration behavior for
 * free (getServerSnapshot below always reports "inactive").
 *
 * `getSnapshot` is a pure read (URL param OR persisted flag) — it must not
 * write, since React's contract allows calling it multiple times per render
 * (including for discarded/interrupted renders). The sessionStorage *write*
 * that makes the flag survive navigation lives in a separate `useEffect`.
 */

const DEBUG_STORAGE_KEY = "greeting-somebody:debug";

function hasDebugQueryParam(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

function readPersistedFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function getSnapshot(): boolean {
  return hasDebugQueryParam() || readPersistedFlag();
}

function subscribe(): () => void {
  // Nothing external to subscribe to (no storage/URL change events we need
  // to react to beyond React's own re-renders on navigation), but the
  // useSyncExternalStore contract requires a subscribe function.
  return () => {};
}

function getServerSnapshot(): boolean {
  return false;
}

/** Whether the debug step jump bar should be shown / the nav guard bypassed. */
export function useDebugFlag(): boolean {
  const active = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (!hasDebugQueryParam()) return;
    try {
      window.sessionStorage.setItem(DEBUG_STORAGE_KEY, "1");
    } catch {
      // Ignore storage failures — the flag still applies for this render via
      // the URL param; it just won't survive navigating to a route that
      // drops the query string.
    }
  }, []);

  return active;
}
