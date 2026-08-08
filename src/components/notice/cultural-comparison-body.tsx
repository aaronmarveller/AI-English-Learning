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
 * Pure presentational — the parent (NoticeCard) owns the accordion's open
 * state; this only renders what's inside once a card is open.
 */
export function CulturalComparisonBody({ card }: CulturalComparisonBodyProps) {
  return (
    <div className="flex flex-col gap-4" data-testid={`${card.id}-comparison`}>
      {card.peopleImage ? (
        <div className="grid grid-cols-2 gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-aspect
              decorative avatar-row composite; next/image's layout machinery buys nothing here. */}
          <img
            src={card.peopleImage.us.src}
            alt={card.peopleImage.us.alt}
            className="aspect-[3/2] w-full rounded-card border border-border object-cover"
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
          <img
            src={card.peopleImage.china.src}
            alt={card.peopleImage.china.alt}
            className="aspect-[3/2] w-full rounded-card border border-border object-cover"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <div
          className="flex flex-col gap-2 rounded-card bg-accent-soft p-2"
          data-testid={`${card.id}-us`}
        >
          <span className="text-caption font-medium text-foreground">{card.us.label}</span>
          <span className="text-body-sm font-semibold text-foreground">{card.us.phrase}</span>
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
          className="flex flex-col gap-2 rounded-card border border-border bg-card p-2"
          data-testid={`${card.id}-china`}
        >
          <span className="text-caption font-medium text-foreground">{card.china.label}</span>
          <span className="text-body-sm font-semibold text-foreground">{card.china.phrase}</span>
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
