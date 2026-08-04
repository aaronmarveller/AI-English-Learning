"use client";

import { useState } from "react";
import { ContinueButton } from "@/components/continue-button";
import { ChunkSection } from "@/components/explore/chunk-section";
import { CulturalComparisonBody } from "@/components/notice/cultural-comparison-body";
import { CULTURAL_INSIGHT_CARDS } from "@/content/notice";

/**
 * Notice page body: 3 Cultural Insight Cards contrasting US and China
 * greeting norms (ticket 07 / spec.md user stories 35-41).
 *
 * Unlike Explore's ChunkSection usage (ticket 06 — every section toggles
 * independently, multiple can be open at once), this is a true single-open
 * accordion: opening any card collapses whichever other card was open
 * (ticket checklist "展开任一张卡时其余自动收起，同一时刻只有一张展开").
 * That semantic lives entirely in this component's single `openCardId`
 * state variable and how `open`/`onToggle` are computed per card —
 * ChunkSection itself is reused unmodified for its header/ARIA/data-testid
 * shape, exactly as the ticket brief suggests ("单开语义可以完全放在父组件
 * 如何计算 open/onToggle 里，不需要 fork 组件").
 *
 * The first card starts open by default (ticket checklist "默认展开第一张
 * 卡"). Continue is always reachable without expanding anything — nothing
 * here gates it (user story 41 / ticket checklist "未展开所有卡也能进入
 * Practice").
 *
 * Split out from page.tsx (a Server Component, so it can keep exporting
 * `metadata`) because the open/closed accordion state needs a Client
 * Component, following the same Server/Client split every learning page
 * uses (see src/app/(learning)/explore/page.tsx).
 */
export function NoticePageContent() {
  const [openCardId, setOpenCardId] = useState<string | null>(
    CULTURAL_INSIGHT_CARDS[0]?.id ?? null,
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Notice</h1>
        <p className="text-body text-muted">
          中美打招呼方式有不少不一样的地方——展开每张卡看看具体差在哪、为什么会这样。
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {CULTURAL_INSIGHT_CARDS.map((card) => {
          const open = openCardId === card.id;

          return (
            <ChunkSection
              key={card.id}
              title={card.title}
              subtitle={card.subtitle}
              open={open}
              onToggle={() => setOpenCardId(open ? null : card.id)}
              testId={card.id}
            >
              <CulturalComparisonBody card={card} />
            </ChunkSection>
          );
        })}
      </div>

      <div className="mt-auto pt-6">
        <ContinueButton next="/practice" markStepComplete="notice">
          继续 Continue
        </ContinueButton>
      </div>
    </div>
  );
}
