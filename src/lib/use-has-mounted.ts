"use client";

import { useSyncExternalStore } from "react";

// No external system to subscribe to — this store's value only ever
// changes once, implicitly, between the server/first-hydration render and
// every render after it. The useSyncExternalStore contract still requires
// a subscribe function.
function subscribe(): () => void {
  return () => {};
}

function getSnapshot(): boolean {
  return true;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * True once past the first client render, false during SSR and the
 * initial hydration-matching render. This is the useSyncExternalStore
 * version of the classic "isClient"/"hasMounted" flag: unlike a plain
 * useState+useEffect, it doesn't call setState from inside an effect body,
 * and — more importantly for guards that also read other
 * useSyncExternalStore-backed values (see src/lib/progress.ts,
 * src/lib/debug.ts) — it flips from false to true via the exact same
 * post-hydration correction mechanism those stores use, so by the render
 * where this becomes true, their real (localStorage/sessionStorage-backed)
 * values have already landed too.
 */
export function useHasMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
