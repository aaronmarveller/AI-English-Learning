import type { Metadata } from "next";
import { ContinueButton } from "@/components/continue-button";

export const metadata: Metadata = {
  title: "Review — Greeting Somebody",
};

// Minimal placeholder — the real Review page (Emily's Chinese recap,
// Retry Lesson, 继续下一课) lands in ticket 11, out of scope here.
// "继续下一课" always leads to Coming Soon per spec (single-lesson MVP),
// so that's already the correct destination for this placeholder's button.
export default function ReviewPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-h1">Review</h1>
      <p className="text-body text-muted">
        Emily 的中文复盘将在这里展示（内容见后续 ticket）。
      </p>
      <div className="mt-auto pt-6">
        <ContinueButton next="/coming-soon" markStepComplete="review">
          继续下一课 Continue
        </ContinueButton>
      </div>
    </div>
  );
}
