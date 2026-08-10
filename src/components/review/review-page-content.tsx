"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CourseProgressChip } from "@/components/course-progress";
import { ReviewTypingIndicator } from "@/components/review/review-typing-indicator";
import { StageTag } from "@/components/stage-tag";
import { LEARNING_SUMMARY_HEADLINE } from "@/content/review";
import { selectFeedback, type FeedbackLine } from "@/lib/feedback-selector";
import { usePractice } from "@/lib/practice-state";
import { markStepComplete } from "@/lib/progress";

/**
 * Learning Summary body for the internal Review stage. Split out from
 * page.tsx (a
 * Server Component, so it can keep exporting `metadata`) for the same
 * reason as every other learning page's split — everything here is
 * client-only state (the practice store, the sequential-reveal timer).
 *
 * Sequential "chat" reveal: `selectFeedback` runs once per mount against the
 * practice store's accumulated `turnRecords` snapshot at that moment (issue
 * #20 — one per-state record per accepted state, replacing the old
 * model-reported `highlightKeys`), then the resulting lines are revealed
 * one at a time with a short pause + a typing indicator between each (user
 * story 76). Retry and Continue both start disabled and only unlock once
 * every line has been revealed (user story 77) — enforced here, not just
 * visually, via the `disabled` prop.
 */
export function ReviewPageContent() {
  const router = useRouter();
  const { turnRecords, resetPractice } = usePractice();

  // Computed exactly once, from the turnRecords snapshot at mount time —
  // this is what makes the highlights reflect *this* practice run rather
  // than reshuffling mid-reveal as the timer below triggers re-renders.
  const [feedbackLines] = useState<FeedbackLine[]>(() => selectFeedback(turnRecords));
  const [revealedCount, setRevealedCount] = useState(0);

  const isRevealing = revealedCount < feedbackLines.length;

  useEffect(() => {
    // Deliberately keyed on `revealedCount` (not the derived `isRevealing`
    // boolean) — `isRevealing` stays `true` across many consecutive
    // increments, so an effect keyed on it alone would only ever fire once
    // (React skips effects whose dependencies are unchanged by Object.is).
    // Keying on the actual counter guarantees a fresh timer after every
    // reveal.
    if (revealedCount >= feedbackLines.length) return;
    // A few hundred ms per line reads as "conversational" without making
    // learners (or E2E tests) wait long — see this ticket's own guidance:
    // total reveal for ~5-6 lines stays comfortably under Playwright's
    // default 5s auto-wait, no fake-clock machinery needed.
    const delayMs = 500 + Math.random() * 400;
    const timeoutId = setTimeout(() => {
      setRevealedCount((count) => Math.min(count + 1, feedbackLines.length));
    }, delayMs);
    return () => clearTimeout(timeoutId);
  }, [revealedCount, feedbackLines.length]);

  function handleRetry() {
    if (isRevealing) return;
    // Clean slate: conversation state back to "greeting", messages and
    // turnRecords cleared (spec.md user story 79: "重练时对话是干净的重新
    // 开始，上次的记录不会串进来").
    resetPractice();
    router.push("/practice");
  }

  function handleContinue() {
    if (isRevealing) return;
    markStepComplete("review");
    router.push("/coming-soon");
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
        {feedbackLines.slice(0, revealedCount).map((line) => (
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
