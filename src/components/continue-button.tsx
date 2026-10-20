"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { completeStep, type StepId } from "@/lib/learning-flow";

type ContinueButtonProps = {
  /** The step being left: marked complete on click; the Learning Flow decides where to go next. */
  step: StepId;
  children: ReactNode;
  className?: string;
};

/**
 * The one primary action button every learning page renders: on click it
 * completes `step` in the Learning Flow and navigates to the route that
 * returns. Pages name only the step they are leaving.
 *
 * @example
 * <ContinueButton step="observe">继续 Continue</ContinueButton>
 */
export function ContinueButton({ step, children, className = "" }: ContinueButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={`btn-primary w-full ${className}`.trim()}
      onClick={() => router.push(completeStep(step))}
    >
      {children}
    </button>
  );
}
