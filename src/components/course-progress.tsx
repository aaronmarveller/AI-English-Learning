"use client";

import { usePathname } from "next/navigation";
import { getStepFromPathname, STEP_IDS, STEP_LABELS, useProgress } from "@/lib/progress";

/**
 * Course-name chip + 6-step progress dots. Previously lived in the shared
 * learning-page `<header>`, above every page's own StageTag (UI draft,
 * 2026-08-07 review round 3: "Greeting Someone 以及进度是放在 Observe 下方" —
 * it belongs below each page's stage pill instead). Kept as one shared
 * component rather than hand-copied into all 6 pages since the underlying
 * state (current step from the route, completed steps from the progress
 * store) is identical everywhere — see src/lib/progress.ts.
 *
 * Dots are plain equal-size circles (UI draft, 2026-08-07 review round 3:
 * "进度的UI...是单纯的...原点" — not the previous current-step elongated pill).
 *
 * Color rule (reverses the earlier "only the current dot is green" rule, per
 * the final design): completed steps are a solid green dot, the current step
 * is a green ring (green border, soft-green fill, small green centre), and
 * upcoming steps are white with a thin border.
 */
export function CourseProgressChip() {
  const pathname = usePathname();
  const { completed } = useProgress();
  const currentStep = getStepFromPathname(pathname);

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex w-fit items-center rounded-button bg-accent-soft px-3 py-1 text-body-sm font-medium text-accent">
        Greeting Someone
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
                "flex h-2.5 w-2.5 items-center justify-center rounded-full " +
                (state === "completed"
                  ? "bg-accent"
                  : state === "current"
                    ? "border-2 border-accent bg-accent-soft"
                    : "border border-border bg-white")
              }
            >
              {state === "current" ? (
                <span aria-hidden className="block h-1 w-1 rounded-full bg-accent" />
              ) : null}
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
