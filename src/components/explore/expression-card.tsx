import type { ExpressionCard as ExpressionCardData } from "@/content/explore";
import { PronunciationButton } from "@/components/explore/pronunciation-button";

type ExpressionCardProps = {
  card: ExpressionCardData;
};

/** One Key Expression card: expression, trait tag, usage-context hint, pronunciation control. */
export function ExpressionCard({ card }: ExpressionCardProps) {
  return (
    <div
      data-testid={`expression-card-${card.id}`}
      className="flex h-full flex-col gap-3 rounded-card border border-border bg-card p-4"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-aspect
          decorative scene photo; next/image's layout machinery buys nothing here. */}
      <img
        src={card.image}
        alt=""
        aria-hidden
        className="aspect-[4/3] w-full rounded-card object-cover"
      />
      {card.pronunciationTexts ? (
        <div className="flex flex-col gap-2">
          {card.pronunciationTexts.map((text, index) => (
            <div key={text} className="flex items-center justify-between gap-2">
              <p className="text-caption text-foreground">{text}</p>
              <PronunciationButton
                text={text}
                testId={`pronounce-${card.id}-${index + 1}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="text-h3 text-foreground">{card.expression}</p>
          <PronunciationButton text={card.expression} testId={`pronounce-${card.id}`} />
        </div>
      )}
      <span className="w-fit rounded-button bg-accent-soft px-2 py-1 text-caption text-accent">
        {card.tag}
      </span>
      <p className="text-body-sm text-muted">{card.hint}</p>
    </div>
  );
}
