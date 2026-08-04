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
      <div className="flex items-start justify-between gap-2">
        <p className="text-h3 text-foreground">{card.expression}</p>
        <PronunciationButton text={card.expression} testId={`pronounce-${card.id}`} />
      </div>
      <span className="w-fit rounded-button bg-accent-soft px-2 py-1 text-caption text-accent">
        {card.tag}
      </span>
      <p className="text-body-sm text-muted">{card.hint}</p>
    </div>
  );
}
