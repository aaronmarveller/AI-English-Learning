import type { Metadata } from "next";
import { ContinueButton } from "@/components/continue-button";
import { SceneVideoPlayer } from "@/components/observe/scene-video-player";
import { WatchForList } from "@/components/observe/watch-for-list";
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
      <div>
        <h1 className="text-h1">Observe</h1>
        <p className="mt-1 text-body text-muted">{OBSERVE_CONTENT.sceneName}</p>
      </div>

      <SceneVideoPlayer
        src={OBSERVE_CONTENT.video.src}
        captionsSrc={OBSERVE_CONTENT.video.captionsSrc}
        sceneName={OBSERVE_CONTENT.sceneName}
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
