"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { DebugJumpBar } from "@/components/debug-jump-bar";
import { TopNav } from "@/components/top-nav";
import { useDebugFlag } from "@/lib/debug";
import { getStepFromPathname, useProgress } from "@/lib/progress";
import { useHasMounted } from "@/lib/use-has-mounted";

/**
 * Shared chrome for the 5 learning pages (Observe/Explore/Notice/Practice/
 * Review): back-to-Home entry, persistent nav, and the progressive-learning
 * guard (redirects to Home if the current step's prerequisite isn't
 * complete yet — unless debug mode is active).
 *
 * The course-name chip + 5-dot progress row used to live here too, but
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
  const { isStepUnlocked } = useProgress();
  const debugEnabled = useDebugFlag();

  const hasMounted = useHasMounted();

  const currentStep = getStepFromPathname(pathname);
  const unlocked = debugEnabled || !currentStep || isStepUnlocked(currentStep);

  useEffect(() => {
    if (!hasMounted || unlocked) return;
    router.replace("/");
  }, [hasMounted, unlocked, router]);

  return (
    <div className="flex min-h-full flex-1 flex-col overflow-x-hidden">
      <DebugJumpBar />

      <header className="border-b border-border px-5 py-4">
        <TopNav
          showStubNav={false}
          left={
            <Link
              href="/"
              aria-label="返回 Home"
              data-testid="back-home"
              className="btn-icon-pressed whitespace-nowrap rounded-button py-1 text-body-sm text-muted"
            >
              <span aria-hidden>←</span> Back to Home
            </Link>
          }
        />
      </header>

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
