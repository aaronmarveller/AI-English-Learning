import type { CulturalInsightCard } from "@/content/notice";

type CulturalComparisonBodyProps = {
  card: CulturalInsightCard;
};

/**
 * The expanded body of a Cultural Insight Card: US vs. China comparison
 * blocks stacked vertically, followed by the "why" explanation.
 *
 * Ticket 07 is explicit that the mobile viewport must stack these two
 * blocks rather than lay them out as side-by-side columns ("手机视口下上下
 * 堆叠，不用左右分栏") — `flex flex-col` here is that decision, and since
 * this app has no separate desktop layout (spec.md "平台与形态": "桌面端不
 * 单独设计"), there's no breakpoint that ever switches this back to columns.
 *
 * Pure presentational — the parent (NoticePageContent, via ChunkSection)
 * owns the accordion's open state; this only renders what's inside once a
 * card is open.
 */
export function CulturalComparisonBody({ card }: CulturalComparisonBodyProps) {
  return (
    <div className="flex flex-col gap-3" data-testid={`${card.id}-comparison`}>
      <div
        className="flex flex-col gap-1 rounded-card bg-accent-soft p-4"
        data-testid={`${card.id}-us`}
      >
        <span className="text-body-sm font-medium text-foreground">{card.us.label}</span>
        <p className="text-body text-foreground">{card.us.description}</p>
      </div>

      <div
        className="flex flex-col gap-1 rounded-card border border-border bg-card p-4"
        data-testid={`${card.id}-china`}
      >
        <span className="text-body-sm font-medium text-foreground">{card.china.label}</span>
        <p className="text-body text-foreground">{card.china.description}</p>
      </div>

      <div className="flex flex-col gap-1 px-1 pt-1" data-testid={`${card.id}-why`}>
        <span className="text-caption text-muted">为什么 Why</span>
        <p className="text-body-sm text-muted">{card.why}</p>
      </div>
    </div>
  );
}
