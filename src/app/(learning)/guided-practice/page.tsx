import type { Metadata } from "next";
import { ContinueButton } from "@/components/continue-button";
import { CourseProgressChip } from "@/components/course-progress";
import { StageTag } from "@/components/stage-tag";

export const metadata: Metadata = {
  title: "Guided Practice — Greeting Someone",
};

// Guided Practice: the Learning Flow step between Explore and Practice
// (CONTEXT.md "Guided Practice"). Deliberately blank — what the learner does
// here has not been designed yet — but it still carries the stage tag, the
// progress chip and a Continue so the empty step never strands anyone.
export default function GuidedPracticePage() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <StageTag label="Guided Practice" icon="🧭" asHeading />
        <CourseProgressChip />
      </div>

      <div className="mt-auto pt-6">
        <ContinueButton next="/practice" markStepComplete="guided-practice">
          Continue 继续学习 →
        </ContinueButton>
      </div>
    </div>
  );
}
