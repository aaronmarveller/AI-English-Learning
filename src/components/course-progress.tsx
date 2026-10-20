"use client";

import Link from "next/link";
import { STEP_IDS, STEP_LABELS, useLearningFlow } from "@/lib/learning-flow";

/**
 * Course-name chip + 6-step progress dots. Previously lived in the shared
 * learning-page `<header>`, above every page's own StageTag (UI draft,
 * 2026-08-07 review round 3: "Greeting Someone 以及进度是放在 Observe 下方" —
 * it belongs below each page's stage pill instead). Kept as one shared
 * component rather than hand-copied into all 6 pages since the underlying
 * state (current step from the route, completed steps from the progress
 * store) is identical everywhere — see src/lib/learning-flow.ts.
 *
 * Dots are plain equal-size circles (UI draft, 2026-08-07 review round 3:
 * "进度的UI...是单纯的...原点" — not the previous current-step elongated pill).
 *
 * Color rule: both `data-state` and the colour come from the Learning Flow's
 * `dots` value: done and current dots are solid green (e.g. on step 3, dots
 * 1-3 are green); upcoming dots are white with a thin border.
 */
export function CourseProgressChip() {
  const { prev, dots } = useLearningFlow();
  const hasPreviousStep = prev !== null && prev !== "/";
  const linkClassName =
    "btn-icon-pressed whitespace-nowrap rounded-button text-body-sm text-muted";

  return (
    <div className="flex items-end justify-between gap-3">
      <span className="flex w-fit items-center rounded-button bg-accent-soft px-3 py-1 text-body-sm font-medium text-accent">
        Greeting Someone
      </span>

      <div className="flex flex-col items-end gap-2">
        <div className="relative -top-7 flex items-center gap-3">
          <Link
            href={prev ?? "/"}
            aria-label={hasPreviousStep ? "返回上一步" : "返回 Home"}
            data-testid={hasPreviousStep ? "back-previous" : "back-home"}
            className={linkClassName}
          >
            <span aria-hidden>←</span>{" "}
            {hasPreviousStep ? "Back to Previous Step" : "Back to Home"}
          </Link>
        </div>

        <ol
          aria-label="学习进度 Learning progress"
          className="flex items-center gap-2"
        >
          {STEP_IDS.map((step, index) => {
            const state = dots[index];
            return (
              <li
                key={step}
                data-testid={`progress-dot-${step}`}
                data-state={state}
                aria-current={state === "current" ? "step" : undefined}
                className={
                  "flex h-2.5 w-2.5 items-center justify-center rounded-full " +
                  (state === "upcoming"
                    ? "border border-border bg-white"
                    : "bg-accent")
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
    </div>
  );
}
