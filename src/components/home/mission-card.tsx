"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent } from "react";
import { HOME_CONTENT } from "@/content/home";

/**
 * Today's Mission card (spec.md user stories 13–15). The whole card is one
 * big tap target — not a card with a nested button — so it's a single
 * `role="button"` element (a plain <div>, not <button>: it needs to contain
 * a heading, and headings aren't valid content inside a native <button>).
 * Keyboard support (Enter/Space) comes along for free with jsx-a11y's
 * interactive-role pattern, even though the E2E coverage only asserts the
 * click path.
 *
 * No nested <button> anywhere inside — Home's separate primary button
 * (StartLessonButton) lives outside this component and triggers the same
 * navigation, so the two "start the lesson" affordances stay two distinct,
 * independently clickable elements instead of one interactive control
 * nested inside another (which both breaks a11y semantics and would double
 * a click's effect via event bubbling).
 */
export function MissionCard() {
  const router = useRouter();
  const { course } = HOME_CONTENT;

  const start = () => router.push("/observe");

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
      className="flex cursor-pointer flex-col gap-4 rounded-card border border-border bg-card p-5 text-left shadow-sm active:scale-[0.98] active:brightness-95"
    >
      {/* Same-size placeholder standing in for the scene thumbnail — no
          real image asset exists yet (spec.md Further Notes). */}
      <div
        aria-hidden
        className="aspect-[16/10] w-full rounded-card bg-gradient-to-br from-accent-soft to-accent/40"
      />

      <div className="flex flex-col gap-1">
        <span className="text-caption font-semibold tracking-wide text-accent uppercase">
          Today&apos;s Mission
        </span>
        <h2 className="text-h2">{course.nameEn}</h2>
        <p className="text-body text-muted">{course.nameZh}</p>
      </div>

      <div className="flex items-center gap-2 text-body-sm text-muted">
        <span>⏱️ {course.duration}</span>
        <span aria-hidden>·</span>
        <span>{course.category}</span>
      </div>
    </div>
  );
}
