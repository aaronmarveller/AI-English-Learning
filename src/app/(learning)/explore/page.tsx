import type { Metadata } from "next";
import { ContinueButton } from "@/components/continue-button";

export const metadata: Metadata = {
  title: "Explore — Greeting Somebody",
};

// Placeholder body only — the real Explore page (Key Expression groups,
// audio, Response 三步阶梯) lands in ticket 05. This just needs to be
// walkable end to end.
export default function ExplorePage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-h1">Explore</h1>
      <p className="text-body text-muted">
        成块的表达将在这里展示（内容见后续 ticket）。
      </p>
      <div className="mt-auto pt-6">
        <ContinueButton next="/notice" markStepComplete="explore">
          继续 Continue
        </ContinueButton>
      </div>
    </div>
  );
}
