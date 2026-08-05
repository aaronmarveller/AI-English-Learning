"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { DebugJumpBar } from "@/components/debug-jump-bar";
import { useDebugFlag } from "@/lib/debug";
import {
  STEP_IDS,
  STEP_LABELS,
  getStepFromPathname,
  useProgress,
} from "@/lib/progress";
import { useHasMounted } from "@/lib/use-has-mounted";

/**
 * Shared chrome for the 5 learning pages (Observe/Explore/Notice/Practice/
 * Review): back-to-Home entry, course name, 5 progress dots, and the
 * progressive-learning guard (redirects to Home if the current step's
 * prerequisite isn't complete yet — unless debug mode is active).
 *
 * Client component: the guard and progress dots both depend on
 * localStorage, which only exists client-side. `completed` and
 * `debugEnabled` are both backed by useSyncExternalStore (see
 * src/lib/progress.ts and src/lib/debug.ts) so their very first read
 * (server render + hydration) reports the SSR-safe default (no progress,
 * debug off) before correcting to the real localStorage/sessionStorage
 * value.
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
  const { completed, isStepUnlocked } = useProgress();
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

      <header className="flex flex-col gap-3 border-b border-border px-5 py-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Link
            href="/"
            aria-label="返回 Home"
            data-testid="back-home"
            className="justify-self-start rounded-button px-2 py-1 text-body-sm text-muted active:scale-95 active:brightness-90"
          >
            <span aria-hidden>←</span> Home
          </Link>
          <span className="justify-self-center text-body-sm font-medium text-foreground">
            Greeting Somebody
          </span>
          <span aria-hidden />
        </div>

        <ol
          aria-label="学习进度 Learning progress"
          className="flex items-center justify-center gap-2"
        >
          {STEP_IDS.map((step, index) => {
            const state =
              step === currentStep ? "current" : completed.includes(step) ? "completed" : "upcoming";
            return (
              <li
                key={step}
                data-testid={`progress-dot-${step}`}
                data-state={state}
                aria-current={step === currentStep ? "step" : undefined}
                className={
                  "h-2 rounded-full transition-all " +
                  (state === "current"
                    ? "w-6 bg-accent"
                    : state === "completed"
                      ? "w-2 bg-accent"
                      : "w-2 bg-border")
                }
              >
                <span className="sr-only">
                  {index + 1}. {STEP_LABELS[step]}
                </span>
              </li>
            );
          })}
        </ol>
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
