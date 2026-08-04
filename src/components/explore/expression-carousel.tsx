import type { ExpressionCard as ExpressionCardData } from "@/content/explore";
import { ExpressionCard } from "@/components/explore/expression-card";

type ExpressionCarouselProps = {
  cards: ExpressionCardData[];
  testId: string;
};

/**
 * Horizontal snap-to-card carousel for 打招呼/问候/结束对话. Pure CSS
 * (Tailwind's `overflow-x-auto` + `snap-x snap-mandatory` on the track,
 * `snap-start` on each card) — no carousel library, per ticket scope.
 *
 * `min-w-0` on the track keeps this container's own overflow from
 * inflating the width of its flex ancestors (a classic flexbox gotcha) —
 * scrolling stays confined to the carousel, never leaking into page-level
 * horizontal scroll.
 */
export function ExpressionCarousel({ cards, testId }: ExpressionCarouselProps) {
  return (
    <div
      data-testid={testId}
      className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
    >
      {cards.map((card) => (
        <div key={card.id} className="w-[78%] shrink-0 snap-start">
          <ExpressionCard card={card} />
        </div>
      ))}
    </div>
  );
}
