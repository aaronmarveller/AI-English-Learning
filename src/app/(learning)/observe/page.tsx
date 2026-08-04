import type { Metadata } from "next";
import { ContinueButton } from "@/components/continue-button";

export const metadata: Metadata = {
  title: "Observe — Greeting Somebody",
};

// Placeholder body only — the real Observe page (scene video, "Watch for"
// list) lands in ticket 04. This just needs to be walkable end to end.
export default function ObservePage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-h1">Observe</h1>
      <p className="text-body text-muted">
        真实场景视频将在这里播放（内容见后续 ticket）。
      </p>
      <div className="mt-auto pt-6">
        <ContinueButton next="/explore" markStepComplete="observe">
          继续 Continue
        </ContinueButton>
      </div>
    </div>
  );
}
