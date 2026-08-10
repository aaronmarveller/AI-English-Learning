import type { Metadata } from "next";
import { ContinueButton } from "@/components/continue-button";
import { CourseProgressChip } from "@/components/course-progress";
import { PinIcon } from "@/components/icons";
import { SceneVideoPlayer } from "@/components/observe/scene-video-player";
import { WatchForList } from "@/components/observe/watch-for-list";
import { StageTag } from "@/components/stage-tag";
import { OBSERVE_CONTENT } from "@/content/observe";

export const metadata: Metadata = {
  title: "Observe — Greeting Somebody",
};

// No task here, just watching: a scene video builds context for what's
// coming in Explore, and "Watch for" tells the learner what to notice
// instead of just watching passively (spec.md User Stories 18-23).
export default function ObservePage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <StageTag label="Observe" asHeading />
        <CourseProgressChip />
        <h2 className="text-display text-foreground">{OBSERVE_CONTENT.headlineEn}</h2>
        <p className="text-body-lg text-muted">{OBSERVE_CONTENT.headlineZh}</p>
      </div>

      <hr className="border-border" />

      <div className="flex items-center gap-1.5 text-body-sm font-medium text-foreground">
        <PinIcon className="h-4 w-4 shrink-0 text-accent" />
        {OBSERVE_CONTENT.sceneNameEn}
        <span className="text-muted">· {OBSERVE_CONTENT.sceneName}</span>
      </div>

      <SceneVideoPlayer
        src={OBSERVE_CONTENT.video.src}
        captionsSrc={OBSERVE_CONTENT.video.captionsSrc}
        sceneName={OBSERVE_CONTENT.sceneName}
        poster="/assets/home/mission-thumb.jpg"
      />

      <WatchForList />

      <div className="mt-auto pt-6">
        <ContinueButton next="/explore" markStepComplete="observe">
          继续 Continue
        </ContinueButton>
      </div>
    </div>
  );
}
