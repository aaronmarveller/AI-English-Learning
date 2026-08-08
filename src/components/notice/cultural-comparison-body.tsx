import type { CulturalInsightCard } from "@/content/notice";

type CulturalComparisonBodyProps = {
  card: CulturalInsightCard;
};

/**
 * The expanded body of a Cultural Insight Card: an optional "who greets this
 * way" avatar-row image pair, then US / China / Why laid out as three
 * side-by-side columns.
 *
 * Side-by-side even on narrow phone viewports is a deliberate reversal of
 * this card's original stacked layout — see
 * docs/adr/0001-side-by-side-comparison-on-mobile.md. Columns shrink text
 * size and spacing to fit rather than falling back to a stacked layout.
 *
 * The avatar-row images use `object-contain`, not `object-cover` — the
 * supplied composites are wide banner strips (~2.15:1), and `object-cover`
 * at the earlier `aspect-[3/2]` cropped people off both edges. `contain`
 * guarantees the full row is always visible regardless of the exact source
 * aspect ratio.
 *
 * The flag badge is a standalone chip (flag emoji only, no "In the
 * US"/"在中国" text) per the mockup, and each column's background/phrase
 * color leans toward its flag color (blue for US, red for China) — using
 * Tailwind's generic blue/red scale, not the app's `--color-danger` token,
 * since this is decorative flag theming, not an error state.
 *
 * Pure presentational — the parent (NoticeCard) owns the accordion's open
 * state; this only renders what's inside once a card is open.
 */
export function CulturalComparisonBody({ card }: CulturalComparisonBodyProps) {
  return (
    <div className="flex flex-col gap-4" data-testid={`${card.id}-comparison`}>
      {card.peopleImage ? (
        <div className="grid grid-cols-2 gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative
              avatar-row composite, natural aspect ratio; next/image's layout
              machinery buys nothing here. */}
          <img
            src={card.peopleImage.us.src}
            alt={card.peopleImage.us.alt}
            className="aspect-[43/20] w-full rounded-card border border-border bg-page object-contain"
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
          <img
            src={card.peopleImage.china.src}
            alt={card.peopleImage.china.alt}
            className="aspect-[43/20] w-full rounded-card border border-border bg-page object-contain"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-[1fr_1fr_1.3fr] gap-2">
        <div
          className="flex flex-col gap-2 rounded-card border border-blue-100 bg-blue-50 p-2"
          data-testid={`${card.id}-us`}
        >
          <span
            aria-hidden
            className="flex w-fit items-center justify-center rounded-button border border-border bg-white px-1.5 py-0.5 text-body-sm"
          >
            {card.us.flag}
          </span>
          <span className="text-body-sm font-semibold text-blue-700">{card.us.phrase}</span>
          <ul className="flex flex-col gap-1">
            {card.us.items.map((item) => (
              <li key={item} className="flex items-start gap-1 text-caption text-foreground">
                <span aria-hidden className="text-accent">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div
          className="flex flex-col gap-2 rounded-card border border-red-100 bg-red-50 p-2"
          data-testid={`${card.id}-china`}
        >
          <span
            aria-hidden
            className="flex w-fit items-center justify-center rounded-button border border-border bg-white px-1.5 py-0.5 text-body-sm"
          >
            {card.china.flag}
          </span>
          <span className="text-body-sm font-semibold text-red-700">{card.china.phrase}</span>
          <ul className="flex flex-col gap-1">
            {card.china.items.map((item) => (
              <li key={item} className="flex items-start gap-1 text-caption text-foreground">
                <span aria-hidden className="text-accent">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-1 px-1 pt-1" data-testid={`${card.id}-why`}>
          <span className="text-caption text-muted">
            <span aria-hidden>☀️</span> 为什么？
          </span>
          <p className="text-caption text-muted">{card.why}</p>
        </div>
      </div>
    </div>
  );
}
