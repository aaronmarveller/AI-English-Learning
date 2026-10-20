import type { Metadata } from "next";
import { ContinueButton } from "@/components/continue-button";
import { CourseProgressChip } from "@/components/course-progress";
import { SceneVideoPlayer } from "@/components/observe/scene-video-player";
import { ThinkingPrompts } from "@/components/observe/thinking-prompts";
import { StageTag } from "@/components/stage-tag";
import { OBSERVE_CONTENT } from "@/content/observe";

export const metadata: Metadata = {
  title: "Observe — Greeting Someone",
};

// No task here, just watching: the thinking prompts tell the learner what
// to notice, and the scene videos build context for what's coming in
// Explore (spec.md User Stories 18-23).
export default function ObservePage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <StageTag label="Observe" asHeading />
        <CourseProgressChip />
        <h2 className="text-display text-foreground">
          {OBSERVE_CONTENT.headlineLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h2>
      </div>

      <ThinkingPrompts />

      <SceneVideoPlayer
        src={OBSERVE_CONTENT.video.src}
        captionsSrc={OBSERVE_CONTENT.video.captionsSrc}
        sceneName={OBSERVE_CONTENT.sceneName}
        poster="/assets/home/mission-thumb.jpg"
      />

      <div className="mt-auto pt-6">
        <ContinueButton next="/explore" markStepComplete="observe">
          Continue 继续学习 →
        </ContinueButton>
      </div>
    </div>
  );
}
