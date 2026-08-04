"use client";

import { useRouter } from "next/navigation";

/**
 * Home's single primary action button (spec.md user story 1: "每个页面只有
 * 一个主操作按钮"). Navigates straight to /observe — no loading screen, no
 * confirmation (spec.md user story 15).
 *
 * Deliberately NOT built on top of <ContinueButton>: that component always
 * calls markStepComplete(step) before navigating, which is correct for
 * *leaving* a learning step (e.g. Observe's own Continue marks "observe"
 * done on the way to Explore — ticket 05). Home isn't a learning step and
 * hasn't done any of the Observe work yet, so reusing ContinueButton here
 * with markStepComplete="observe" would mark Observe complete before the
 * learner ever saw it — silently unlocking Explore via direct URL and
 * defeating the no-skipping-steps guard (src/app/(learning)/layout.tsx).
 * `observe` has no prerequisite (src/lib/progress.ts: index 0 is always
 * unlocked), so Home doesn't need to mark anything complete at all — a
 * plain client-side navigation is both correct and sufficient.
 */
export function StartLessonButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      data-testid="start-lesson-button"
      onClick={() => router.push("/observe")}
      className="btn-primary w-full active:scale-[0.98] active:brightness-90"
    >
      Start Lesson 开始上课
    </button>
  );
}
