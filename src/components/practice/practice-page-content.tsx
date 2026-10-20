"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { CourseProgressChip } from "@/components/course-progress";
import { CallTranscript } from "@/components/practice/call-transcript";
import { EmilyAvatar, type EmilyAvatarState } from "@/components/practice/emily-avatar";
import { EmilyInfoCard } from "@/components/practice/emily-info-card";
import { StageTag } from "@/components/stage-tag";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";
import { callNumber, MAX_CALLS } from "@/lib/practice";
import { usePractice } from "@/lib/practice-state";
import { completeStep } from "@/lib/learning-flow";
import { useLiveCall } from "@/lib/use-live-call";

/**
 * Practice page body: a live voice Call with Emily (CONTEXT.md "Practice",
 * "Call"). Everything here is client-only state — the Practice store, the
 * Realtime connection — so it is split out from page.tsx (a Server
 * Component, so it can keep exporting `metadata`).
 *
 * The input area is one button: 开始对话 / 挂断对话, which shows the seconds
 * left while a Call is live. A Practice allows three Calls (第 N / 3 通); the
 * bubbles show the latest Call's Turns.
 */
export function PracticePageContent() {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const { state, canStartCall, latestCall, canViewLearningSummary } = usePractice();
  const { phase, remaining, floor, error, start, hangUp } = useLiveCall(audioRef);

  const inCall = phase === "connecting" || phase === "live" || phase === "ending";
  const avatarState: EmilyAvatarState = phase === "connecting" ? "thinking" : floor === "emily" && inCall ? "talking" : "idle";

  // Which Call this is: the live one, or the next one to be made.
  const currentCall = callNumber(state, inCall);
  const summaryEnabled = canViewLearningSummary && phase !== "connecting";

  let buttonLabel: string;
  if (phase === "live") buttonLabel = `挂断对话 ${remaining}s`;
  else if (phase === "connecting") buttonLabel = "连接中…";
  else if (phase === "ending") buttonLabel = "正在结束…";
  else if (!canStartCall) buttonLabel = `${MAX_CALLS} 次通话已用完`;
  else buttonLabel = "开始对话";

  function handleViewSummary() {
    if (!summaryEnabled) return;
    router.push(completeStep("practice"));
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <StageTag label="Practice" icon="🎙" asHeading />
        <CourseProgressChip />
      </div>

      <EmilyAvatar
        state={avatarState}
        topOverlay={<EmilyInfoCard />}
        headlineOverlay={
          <div className="flex flex-col gap-1.5">
            <h2 className="text-h3 leading-tight font-bold text-accent">{GREETING_SOMEBODY_LESSON.headline.en}</h2>
            <p className="text-body-sm font-semibold text-accent">{GREETING_SOMEBODY_LESSON.headline.zh}</p>
            <p className="text-[8px] leading-snug text-foreground/80">
              和 Emily 进行真实对话练习，
              <br />
              建立自信，轻松开口说英语！
            </p>
          </div>
        }
      />

      <CallTranscript lines={latestCall?.lines ?? []} />

      <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
        <p data-testid="call-counter" className="text-center text-body-lg font-semibold text-foreground">
          <span aria-hidden>📞</span> 第 {currentCall} / {MAX_CALLS} 通
        </p>

        {error ? (
          <p role="alert" data-testid="practice-error" className="text-body-sm text-danger">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={phase === "live" ? hangUp : () => void start()}
          disabled={phase === "idle" ? !canStartCall : phase !== "live"}
          data-testid="call-button"
          data-phase={phase}
          className={phase === "live" ? "btn-outline w-full" : "btn-accent w-full"}
        >
          {buttonLabel}
        </button>
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-6">
        <button
          type="button"
          disabled={!summaryEnabled}
          onClick={handleViewSummary}
          data-testid="view-summary-button"
          className="btn-primary flex w-full items-center justify-center gap-2"
        >
          查看学习总结 View Learning Summary <span aria-hidden>→</span>
        </button>
      </div>

      <audio ref={audioRef} autoPlay playsInline />
    </div>
  );
}
