"use client";

import { useState } from "react";
import { ContinueButton } from "@/components/continue-button";
import { CourseProgressChip } from "@/components/course-progress";
import { CulturalComparisonBody } from "@/components/notice/cultural-comparison-body";
import { NoticeCard } from "@/components/notice/notice-card";
import { StageTag } from "@/components/stage-tag";
import { CULTURAL_INSIGHT_CARDS, NOTICE_HEADLINE, NOTICE_HERO_IMAGE } from "@/content/notice";

/**
 * Notice page body: 3 Cultural Insight Cards contrasting US and China
 * greeting norms (ticket 07 / spec.md user stories 35-41).
 *
 * Unlike Explore's ChunkSection usage (ticket 06 — every section toggles
 * independently, multiple can be open at once), this is a true single-open
 * accordion: opening any card collapses whichever other card was open
 * (ticket checklist "展开任一张卡时其余自动收起，同一时刻只有一张展开").
 * That semantic lives entirely in this component's single `openCardId`
 * state variable and how `open`/`onToggle` are computed per card — NoticeCard
 * itself (src/components/notice/notice-card.tsx) only renders whatever
 * open/closed state it's given.
 *
 * The first card starts open by default (ticket checklist "默认展开第一张
 * 卡"). Continue is always reachable without expanding anything — nothing
 * here gates it (user story 41 / ticket checklist "未展开所有卡也能进入
 * Practice").
 *
 * `asHeading` on StageTag (UI draft, 2026-08-07 review) makes the "👁
 * Notice" pill itself the page's accessible h1, matching Explore/Observe —
 * the mockup has no separate literal "Notice" heading beneath it.
 *
 * The hero headline/subtitle sits in a two-column row next to the hero
 * illustration (not stacked above it) — live QA against the 2026-08-07
 * mockup found the original stacked, full-width-image version read far
 * larger than intended; splitting the row is what actually makes the
 * headline read at mockup scale.
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
      <div className="flex flex-col gap-2">
        <StageTag label="Notice" asHeading />
        <CourseProgressChip />

        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2 className="text-h2 text-foreground">{NOTICE_HEADLINE.en}</h2>
            <p className="text-body text-muted">{NOTICE_HEADLINE.zh}</p>
            <p className="text-caption text-muted">
              中美打招呼方式有不少不一样的地方——展开每张卡看看具体差在哪、为什么会这样。
            </p>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element -- decorative
              hero illustration, natural aspect ratio; next/image's layout
              machinery buys nothing here. */}
          <img
            src={NOTICE_HERO_IMAGE.src}
            alt={NOTICE_HERO_IMAGE.alt}
            aria-hidden
            className="w-[38%] shrink-0 rounded-card object-contain"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {CULTURAL_INSIGHT_CARDS.map((card, index) => {
          const open = openCardId === card.id;

          return (
            <NoticeCard
              key={card.id}
              index={index + 1}
              card={card}
              open={open}
              onToggle={() => setOpenCardId(open ? null : card.id)}
            >
              <CulturalComparisonBody card={card} />
            </NoticeCard>
          );
        })}
      </div>

      <div className="mt-auto pt-6">
        <ContinueButton next="/practice" markStepComplete="notice">
          开始练习 <span aria-hidden>→</span>
          <span className="sr-only"> Continue</span>
        </ContinueButton>
      </div>
    </div>
  );
}
