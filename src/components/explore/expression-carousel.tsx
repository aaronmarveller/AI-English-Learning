"use client";

import { useRef, useState } from "react";
import type { ExpressionCard as ExpressionCardData } from "@/content/explore";
import { ExpressionCard } from "@/components/explore/expression-card";

type ExpressionCarouselProps = {
  cards: ExpressionCardData[];
  testId: string;
};

/**
 * Horizontal snap-to-card carousel for 打招呼/问候/结束对话. Pure CSS scroll
 * (Tailwind's `overflow-x-auto` + `snap-x snap-mandatory` on the track,
 * `snap-start` on each card, `w-[65%]` per-card so ~32% of the next card
 * peeks in as a swipe affordance) — no carousel library, per ticket scope.
 * The only JS is an `onScroll` listener that derives the active card index
 * for the pagination dots below the track; the dots are a passive read-out,
 * not an alternate navigation control.
 *
 * `min-w-0` on the track keeps this container's own overflow from
 * inflating the width of its flex ancestors (a classic flexbox gotcha) —
 * scrolling stays confined to the carousel, never leaking into page-level
 * horizontal scroll.
 */
export function ExpressionCarousel({ cards, testId }: ExpressionCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  function handleScroll() {
    const track = trackRef.current;
    if (!track) return;

    // Each card is only 65% wide (the rest peeks the next card in), so the
    // last card's snap-start point sits past the track's native max scroll —
    // the browser clamps there instead. A fixed per-card step therefore
    // undercounts the final card and lands the dot in the middle. Mapping
    // scroll progress as a 0-1 fraction across the full scrollable range
    // (not a fixed card-width step) keeps index 0 and the last index pinned
    // to the actual start/end of the scrollable range regardless of peek width.
    const maxScrollLeft = track.scrollWidth - track.clientWidth;
    if (maxScrollLeft <= 0) {
      setActiveIndex(0);
      return;
    }

    const fraction = track.scrollLeft / maxScrollLeft;
    const index = Math.round(fraction * (cards.length - 1));
    setActiveIndex(Math.min(cards.length - 1, Math.max(0, index)));
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={trackRef}
        data-testid={testId}
        onScroll={handleScroll}
        className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
      >
        {cards.map((card) => (
          <div key={card.id} className="w-[65%] shrink-0 snap-start">
            <ExpressionCard card={card} />
          </div>
        ))}
      </div>

      {cards.length > 1 ? (
        <ol aria-label="当前卡片 Current card" className="flex items-center justify-center gap-2">
          {cards.map((card, index) => {
            const state = index === activeIndex ? "active" : "inactive";
            return (
              <li
                key={card.id}
                data-testid={`${testId}-dot-${index}`}
                data-state={state}
                className={
                  "h-2.5 w-2.5 rounded-full " +
                  (state === "active" ? "bg-accent" : "border border-border bg-white")
                }
              >
                <span className="sr-only">
                  {index + 1} / {cards.length}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
