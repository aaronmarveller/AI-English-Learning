import type { Metadata } from "next";
import { ContinueButton } from "@/components/continue-button";

export const metadata: Metadata = {
  title: "Notice — Greeting Somebody",
};

// Minimal placeholder — the real Notice page (Cultural Insight cards)
// lands in ticket 07, out of scope here. Just needs to be walkable.
export default function NoticePage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-h1">Notice</h1>
      <p className="text-body text-muted">
        中美打招呼文化差异卡片将在这里展示（内容见后续 ticket）。
      </p>
      <div className="mt-auto pt-6">
        <ContinueButton next="/practice" markStepComplete="notice">
          继续 Continue
        </ContinueButton>
      </div>
    </div>
  );
}
