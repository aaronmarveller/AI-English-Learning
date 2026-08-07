"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent } from "react";
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
      className="flex cursor-pointer items-center gap-4 text-left active:scale-[0.98] active:brightness-95"
    >
      {/* Same-size placeholder standing in for the scene thumbnail — no
          real image asset exists yet (spec.md Further Notes). */}
      <div
        aria-hidden
        className="aspect-square w-28 shrink-0 rounded-card bg-gradient-to-br from-accent-soft to-accent/40"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-lg"
          >
            👋
          </span>
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate text-h2">{course.nameEn}</h2>
            <p className="text-body text-muted">{course.nameZh}</p>
          </div>
        </div>

        <hr className="border-border" />

        <div className="flex items-center gap-1.5 text-body-sm text-muted">
          <span aria-hidden>🌐</span>
          <span>{course.category}</span>
        </div>
      </div>
    </div>
  );
}
