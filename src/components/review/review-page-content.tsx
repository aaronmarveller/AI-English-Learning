"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ReviewTypingIndicator } from "@/components/review/review-typing-indicator";
import { selectFeedback, type FeedbackLine } from "@/lib/feedback-selector";
import { usePractice } from "@/lib/practice-state";
import { markStepComplete } from "@/lib/progress";

/**
 * Review page body (ticket 11; spec.md "Review 页" + "语言口径" > "Review 全
 * 中文叙述 + 英文例句嵌入"; user stories 69-81). Split out from page.tsx (a
 * Server Component, so it can keep exporting `metadata`) for the same
 * reason as every other learning page's split — everything here is
 * client-only state (the practice store, the sequential-reveal timer).
 *
 * Sequential "chat" reveal: `selectFeedback` runs once per mount against the
 * practice store's accumulated `highlightKeys` snapshot at that moment, then
 * the resulting lines are revealed one at a time with a short pause + a
 * typing indicator between each (user story 76). Retry and Continue both
 * start disabled and only unlock once every line has been revealed (user
 * story 77) — enforced here, not just visually, via the `disabled` prop.
 */
export function ReviewPageContent() {
  const router = useRouter();
  const { highlightKeys, resetPractice } = usePractice();

  // Computed exactly once, from the highlightKeys snapshot at mount time —
  // this is what makes the highlights reflect *this* practice run rather
  // than reshuffling mid-reveal as the timer below triggers re-renders.
  const [feedbackLines] = useState<FeedbackLine[]>(() => selectFeedback(highlightKeys));
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
    // highlightKeys cleared (spec.md user story 79: "重练时对话是干净的重新
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
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Review</h1>
        <p className="text-body text-muted">Emily 的复盘——听听这次打招呼练习聊得怎么样。</p>
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
            className="w-fit max-w-[90%] self-start rounded-card bg-primary px-4 py-3 text-primary-foreground"
          >
            <p className="text-body-lg">{line.textZh}</p>
          </div>
        ))}

        {isRevealing ? <ReviewTypingIndicator /> : null}

        <span className="sr-only" role="status">
          {isRevealing ? "Emily 正在输入 Typing" : "反馈已全部显示 Feedback complete"}
        </span>
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-6">
        <button
          type="button"
          disabled={isRevealing}
          onClick={handleRetry}
          data-testid="retry-button"
          className="btn-primary w-full active:scale-[0.98] active:brightness-90"
        >
          重练 Retry Lesson
        </button>
        <button
          type="button"
          disabled={isRevealing}
          onClick={handleContinue}
          data-testid="review-continue-button"
          className="btn-primary w-full active:scale-[0.98] active:brightness-90"
        >
          继续下一课 Continue
        </button>
      </div>
    </div>
  );
}
