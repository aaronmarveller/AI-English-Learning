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

const TAG_TONE = {
  green: "bg-accent-soft text-accent",
  blue: "bg-blue-100 text-blue-700",
} as const;

// No task here, just watching: the thinking prompts tell the learner what
// to notice, and the scene videos build context for what's coming in
// Explore (spec.md User Stories 18-23).
export default function ObservePage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <StageTag label="Observe" asHeading />
        <CourseProgressChip />
        <h2 className="text-[24px] leading-8 font-bold text-foreground">
          {OBSERVE_CONTENT.headlineLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h2>
      </div>

      <ThinkingPrompts />

      <div className="flex flex-col gap-6">
        {OBSERVE_CONTENT.scenes.map((scene) => (
          <section
            key={scene.id}
            data-testid={`observe-scene-${scene.id}`}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex min-w-0 items-center gap-2 text-[14px] leading-6 font-semibold whitespace-nowrap text-foreground">
                <span aria-hidden className="text-[18px]">
                  {scene.emoji}
                </span>
                {scene.nameEn}
              </h3>
              <span
                className={`shrink-0 rounded-button px-2 py-1 text-[9px] font-medium whitespace-nowrap ${TAG_TONE[scene.tag.tone]}`}
              >
                {scene.tag.en} {scene.tag.zh}
              </span>
            </div>
            <SceneVideoPlayer
              id={scene.id}
              src={scene.video.src}
              captionsSrc={scene.video.captionsSrc}
              sceneName={scene.nameZh}
              poster={scene.video.poster}
            />
          </section>
        ))}
      </div>

      <div className="mt-auto pt-6">
        <ContinueButton step="observe">
          Continue 继续学习 →
        </ContinueButton>
      </div>
    </div>
  );
}
