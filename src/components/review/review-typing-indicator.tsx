"use client";

/**
 * The small 3-dot "typing" indicator shown between each revealed feedback
 * line on Review (ticket 11; spec.md user story 76: "反馈一条一条出现、像真
 * 的在聊天, so that 有陪伴感而不是收到一份报告").
 *
 * Deliberately reuses the exact `.emily-thinking-dot` CSS animation ticket
 * 08's EmilyAvatar already established in src/app/globals.css, rather than
 * inventing a second animation — same visual language across Practice and
 * Review, and it already respects `prefers-reduced-motion: reduce` (see the
 * `@media` block at the bottom of globals.css, which drops the bounce
 * animation and leaves the dots as a static, non-distracting row).
 */
export function ReviewTypingIndicator() {
  return (
    <div
      data-testid="review-typing-indicator"
      aria-hidden
      className="flex w-fit items-center gap-1 self-start rounded-card bg-primary/10 px-4 py-3"
    >
      <span className="emily-thinking-dot h-1.5 w-1.5 rounded-full bg-muted" />
      <span className="emily-thinking-dot h-1.5 w-1.5 rounded-full bg-muted" />
      <span className="emily-thinking-dot h-1.5 w-1.5 rounded-full bg-muted" />
    </div>
  );
}
