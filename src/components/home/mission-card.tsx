"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent } from "react";
import { CheckIcon } from "@/components/icons";
import { HOME_CONTENT } from "@/content/home";
import { STEP_ROUTES } from "@/lib/progress";

/**
 * Today's Mission card content (spec.md user stories 13–15). The whole
 * thing is one big tap target — not a card with a nested button — so it's a
 * single `role="button"` element (a plain <div>, not <button>: it needs to
 * contain a heading, and headings aren't valid content inside a native
 * <button>). Keyboard support (Enter/Space) comes along for free with
 * jsx-a11y's interactive-role pattern, even though the E2E coverage only
 * asserts the click path.
 *
 * No nested <button> anywhere inside — Home's separate primary button
 * (StartLessonButton) lives outside this component (as a sibling inside the
 * shared card shell page.tsx wraps around both) and triggers the same
 * navigation, so the two "start the lesson" affordances stay two distinct,
 * independently clickable elements instead of one interactive control
 * nested inside another (which both breaks a11y semantics and would double
 * a click's effect via event bubbling).
 *
 * The outer card chrome (border/shadow/"Today's Mission" + duration header)
 * lives in page.tsx, not here (UI draft, 2026-08-07 review: header, this
 * photo+text row, and the Start button all share one card shell) — this
 * component only owns the clickable photo+text row itself.
 *
 * The scene thumbnail (public/assets/home/mission-thumb.jpg) is real —
 * wired in per the same 2026-08-07 review feedback that flagged the
 * gradient placeholder as looking like a missing image.
 */
export function MissionCard() {
  const router = useRouter();
  const { course } = HOME_CONTENT;

  const start = () => router.push(STEP_ROUTES.observe);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      start();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="mission-card"
      aria-label={`开始今日课程 ${course.nameEn} ${course.nameZh}`}
      onClick={start}
      onKeyDown={handleKeyDown}
      className="flex cursor-pointer items-center gap-3 text-left active:scale-[0.98] active:brightness-95"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-aspect
          decorative crop; next/image's layout machinery buys nothing here. */}
      <img
        src="/assets/home/mission-thumb.jpg"
        alt=""
        aria-hidden
        className="aspect-[4/3] w-2/5 shrink-0 rounded-card object-cover object-center"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1">
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs"
          >
            👋
          </span>
          <h2 className="text-body font-semibold whitespace-nowrap">{course.nameEn}</h2>
        </div>
        <p className="text-caption text-muted">{course.objectivesIntro}</p>
        <ul className="flex flex-col gap-0.5 text-caption text-muted">
          {course.objectives.map((objective) => (
            <li key={objective.text} className="flex items-start gap-1">
              <CheckIcon className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{objective.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
