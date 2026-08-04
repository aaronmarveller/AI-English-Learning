"use client";

import { useSyncExternalStore } from "react";

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
 */

const DEBUG_STORAGE_KEY = "greeting-somebody:debug";

function readAndPersist(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("debug") === "1") {
    try {
      window.sessionStorage.setItem(DEBUG_STORAGE_KEY, "1");
    } catch {
      // Ignore storage failures — the flag still applies for this render.
    }
    return true;
  }
  try {
    return window.sessionStorage.getItem(DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
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
  return useSyncExternalStore(subscribe, readAndPersist, getServerSnapshot);
}
