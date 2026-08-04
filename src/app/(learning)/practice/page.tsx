import type { Metadata } from "next";
import { ContinueButton } from "@/components/continue-button";

export const metadata: Metadata = {
  title: "Practice — Greeting Somebody",
};

// Minimal placeholder — the real Practice page (AI conversation with
// Emily, speech I/O, the 4-step conversation state machine) lands in
// tickets 08-10, out of scope here. Just needs to be walkable.
export default function PracticePage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-h1">Practice</h1>
      <p className="text-body text-muted">
        和 Emily 的对话练习将在这里进行（内容见后续 ticket）。
      </p>
      <div className="mt-auto pt-6">
        <ContinueButton next="/review" markStepComplete="practice">
          继续 Continue
        </ContinueButton>
      </div>
    </div>
  );
}
