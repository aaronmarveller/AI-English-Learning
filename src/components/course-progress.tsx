"use client";

import { usePathname } from "next/navigation";
import { getStepFromPathname, STEP_IDS, STEP_LABELS, useProgress } from "@/lib/progress";

/**
 * Course-name chip + 5-step progress dots. Previously lived in the shared
 * learning-page `<header>`, above every page's own StageTag (UI draft,
 * 2026-08-07 review round 3: "Greeting Somebody 以及进度是放在 Observe 下方" —
 * it belongs below each page's stage pill instead). Kept as one shared
 * component rather than hand-copied into all 5 pages since the underlying
 * state (current step from the route, completed steps from the progress
 * store) is identical everywhere — see src/lib/progress.ts.
 *
 * Dots are plain equal-size circles (UI draft, 2026-08-07 review round 3:
 * "进度的UI...是单纯的...原点" — not the previous current-step elongated pill).
 *
 * Color rule: completed steps and the current step both render solid green;
 * only upcoming steps stay white with a thin border. This reverses round 5's
 * correction (which made only the current step green, reasoning that
 * coloring completed steps too read as "every dot is green") — see
 * docs/adr/0002-progress-dots-completed-and-current-green.md for why the
 * 2026-08-07 Notice mockup overrides that call.
 */
export function CourseProgressChip() {
  const pathname = usePathname();
  const { completed } = useProgress();
  const currentStep = getStepFromPathname(pathname);

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex w-fit items-center rounded-button bg-accent-soft px-3 py-1 text-body-sm font-medium text-accent">
        Greeting Somebody
      </span>

      <ol aria-label="学习进度 Learning progress" className="flex items-center gap-2">
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
                "h-2.5 w-2.5 rounded-full " +
                (state === "upcoming" ? "border border-border bg-white" : "bg-accent")
              }
            >
              <span className="sr-only">
                {index + 1}. {STEP_LABELS[step]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
