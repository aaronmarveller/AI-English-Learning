"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { markStepComplete, type StepId } from "@/lib/progress";

type ContinueButtonProps = {
  /** Route to navigate to after marking the current step complete. */
  next: string;
  /** Step to mark complete in the progress store when clicked. */
  markStepComplete: StepId;
  children: ReactNode;
  className?: string;
};

/**
 * The one primary action button every learning page renders: on click it
 * marks the current step complete in the progress store, then navigates to
 * `next`. This is the shared "advance to next step" control referenced by
 * later tickets (04/05/06) for Home/Observe/Explore's real page content.
 *
 * @example
 * <ContinueButton next="/explore" markStepComplete="observe">
 *   继续 Continue
 * </ContinueButton>
 */
export function ContinueButton({
  next,
  markStepComplete: step,
  children,
  className = "",
}: ContinueButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={`btn-primary w-full active:scale-[0.98] active:brightness-90 ${className}`.trim()}
      onClick={() => {
        markStepComplete(step);
        router.push(next);
      }}
    >
      {children}
    </button>
  );
}
