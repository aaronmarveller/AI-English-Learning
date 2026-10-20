"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CourseProgressChip } from "@/components/course-progress";
import { ReviewTypingIndicator } from "@/components/review/review-typing-indicator";
import { StageTag } from "@/components/stage-tag";
import { LEARNING_SUMMARY_HEADLINE } from "@/content/review";
import { loadSummaryLines } from "@/lib/load-summary-lines";
import type { SummaryLine } from "@/lib/learning-summary";
import { resetPractice, usePractice } from "@/lib/practice-state";
import { completeStep, useLearningFlow } from "@/lib/learning-flow";

/**
 * Learning Summary body for the internal Review stage. Split out from
 * page.tsx (a Server Component, so it can keep exporting `metadata`) because
 * everything here is client-only state (the Practice store, the summary
 * request, the sequential-reveal timer).
 *
 * The summary is written by Claude from everything the learner said across
 * all of their Calls (src/app/api/realtime/summary/route.ts); if that fails,
 * the learner's own English and Chinese lines are shown instead of an error.
 * Once the lines are in, they are revealed one at a time with a short pause
 * and a typing indicator between each. Retry and Continue both stay disabled
 * until the whole summary has been revealed.
 */
export function ReviewPageContent() {
  const router = useRouter();
  const { calls } = usePractice();
  const { prev } = useLearningFlow();

  // Requested exactly once, from the Calls as they stand at mount time.
  const [callsAtMount] = useState(calls);
  const [summaryLines, setSummaryLines] = useState<SummaryLine[] | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);

  const isRevealing = summaryLines === null || revealedCount < summaryLines.length;

  useEffect(() => {
    const controller = new AbortController();
    void loadSummaryLines(callsAtMount, controller.signal).then((lines) => {
      if (!controller.signal.aborted) setSummaryLines(lines);
    });
    return () => controller.abort();
  }, [callsAtMount]);

  useEffect(() => {
    // Keyed on `revealedCount` so every reveal re-arms a fresh timer.
    if (summaryLines === null || revealedCount >= summaryLines.length) return;
    // A few hundred ms per line reads as "conversational" without making
    // learners (or E2E tests) wait long.
    const delayMs = 500 + Math.random() * 400;
    const timeoutId = setTimeout(() => {
      setRevealedCount((count) => Math.min(count + 1, summaryLines.length));
    }, delayMs);
    return () => clearTimeout(timeoutId);
  }, [revealedCount, summaryLines]);

  function handleRetry() {
    if (isRevealing) return;
    // Three Calls again, no transcripts (CONTEXT.md "Practice").
    resetPractice();
    if (prev) router.push(prev);
  }

  function handleContinue() {
    if (isRevealing) return;
    router.push(completeStep("review"));
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <StageTag label="Summary" icon="✨" />
        <CourseProgressChip />
        <h1 className="text-display text-accent">{LEARNING_SUMMARY_HEADLINE.en}</h1>
        <p className="text-body-lg text-muted">{LEARNING_SUMMARY_HEADLINE.zh}</p>
        <p className="text-body text-muted">{LEARNING_SUMMARY_HEADLINE.supportingZh}</p>
      </div>

      {/*
        emily-review.png (like emily-practice.png) is a transparent cutout,
        not a standalone photo — rendering it alone with object-cover left
        its transparent margins showing the plain page background instead of
        a room, unlike every other page's photography. Composited over
        room-big.png the same way src/components/practice/emily-avatar.tsx
        does, for the same "photo, not a floating sticker" look.
      */}
      <div className="relative w-full overflow-hidden rounded-card" style={{ aspectRatio: "4 / 3" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-aspect
            decorative composite; next/image's layout machinery buys nothing here. */}
        <img
          src="/assets/emily/room-big.png"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div aria-hidden className="absolute inset-0 flex items-end justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
          <img
            src="/assets/emily/emily-review.png"
            alt=""
            className="h-[92%] max-w-none object-contain"
          />
        </div>
      </div>

      <div
        data-testid="review-feedback-list"
        className="flex flex-1 flex-col gap-3 rounded-card border border-border bg-card p-4"
      >
        {(summaryLines ?? []).slice(0, revealedCount).map((line) => (
          <div
            key={line.id}
            data-testid="review-line"
            data-kind={line.kind}
            className="flex w-fit max-w-[90%] items-start gap-2 self-start"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- small
                decorative avatar crop; next/image buys nothing here. */}
            <img
              src="/assets/emily/emily-avatar.png"
              alt=""
              aria-hidden
              className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover object-top"
            />
            <p className="rounded-card border border-border bg-page px-4 py-3 text-body-lg text-foreground">
              {line.text}
            </p>
          </div>
        ))}

        {isRevealing ? <ReviewTypingIndicator /> : null}

        <span className="sr-only" role="status">
          {isRevealing ? "Emily is typing 艾米丽正在输入" : "Learning Summary complete 学习总结已完成"}
        </span>
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-6">
        <button
          type="button"
          disabled={isRevealing}
          onClick={handleRetry}
          data-testid="retry-button"
          className="btn-outline w-full"
        >
          重练 Retry Lesson
        </button>
        <button
          type="button"
          disabled={isRevealing}
          onClick={handleContinue}
          data-testid="review-continue-button"
          className="btn-accent w-full"
        >
          继续下一课 Continue
        </button>
      </div>
    </div>
  );
}
