"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { DebugJumpBar } from "@/components/debug-jump-bar";
import { useLearningFlow } from "@/lib/learning-flow";
import { useHasMounted } from "@/lib/use-has-mounted";

/**
 * Shared chrome for the 6 learning pages (Observe/Notice/Explore/Guided
 * Practice/Practice/Review): the progressive-learning
 * guard (redirects to Home if the current step's prerequisite isn't
 * complete yet — unless debug mode is active).
 *
 * The course-name chip + 6-dot progress row used to live here too, but
 * moved into each page's own content (src/components/course-progress.tsx,
 * rendered below each page's StageTag) per the UI draft's 2026-08-07 review
 * round 3 feedback that it belongs below the stage pill, not in the shared
 * header above it.
 *
 * Client component: the guard depends on localStorage, which only exists
 * client-side. `debugEnabled` is backed by useSyncExternalStore (see
 * src/lib/debug.ts) so its very first read (server render + hydration)
 * reports the SSR-safe default (debug off) before correcting to the real
 * sessionStorage value.
 *
 * That correction and our own redirect effect are both plain passive
 * effects on this component, so on a hard reload they can fire in the
 * same flush *before* the corrected value has propagated to a render —
 * evaluating the guard against stale empty progress would incorrectly
 * bounce a mid-flow refresh back to Home. `hasMounted` defers the guard's
 * actual decision to the render *after* mount, by which point the
 * corrected snapshot has landed.
 */
export default function LearningLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { unlocked } = useLearningFlow();
  const hasMounted = useHasMounted();

  useEffect(() => {
    if (!hasMounted || unlocked) return;
    router.replace("/");
  }, [hasMounted, unlocked, router]);

  return (
    <div className="flex min-h-full flex-1 flex-col overflow-x-hidden">
      <DebugJumpBar />

      <main className="flex flex-1 flex-col px-5 py-6">
        {hasMounted && unlocked ? (
          // key={pathname}: forces React to remount this wrapper on every
          // navigation, which restarts the .page-transition CSS animation
          // (ticket 14) — a plain re-render wouldn't replay a CSS animation.
          <div key={pathname} className="page-transition flex flex-1 flex-col">
            {children}
          </div>
        ) : null}
      </main>
    </div>
  );
}
