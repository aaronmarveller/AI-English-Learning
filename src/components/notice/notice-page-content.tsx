"use client";

import { useState } from "react";
import { ContinueButton } from "@/components/continue-button";
import { CourseProgressChip } from "@/components/course-progress";
import { NoticeCard } from "@/components/notice/notice-card";
import { StageTag } from "@/components/stage-tag";
import { NOTICE_CARDS, NOTICE_HEADLINE } from "@/content/notice";

/**
 * Notice page body: three Notice Cards about what a greeting means (#78).
 *
 * Accordion — all cards start collapsed and opening one collapses the others. Continue is always reachable; nothing gates it.
 *
 * `asHeading` on StageTag makes the "Notice" pill the page's accessible h1,
 * matching Explore/Observe.
 *
 * Split out from page.tsx (a Server Component, so it can keep exporting
 * `metadata`) because the open/closed state needs a Client Component.
 */
export function NoticePageContent() {
  const [openId, setOpenId] = useState<string | null>(null);

  function toggle(id: string) {
    setOpenId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <StageTag label="Notice" icon="💡" asHeading />
        <CourseProgressChip />
        <h2 className="text-[min(24px,5.5vw)] leading-8 font-bold whitespace-nowrap text-foreground">{NOTICE_HEADLINE.en}</h2>
        <p className="text-body text-muted">{NOTICE_HEADLINE.zh}</p>
      </div>

      <div className="flex flex-col gap-4">
        {NOTICE_CARDS.map((card, index) => (
          <NoticeCard
            key={card.id}
            index={index + 1}
            card={card}
            open={openId === card.id}
            onToggle={() => toggle(card.id)}
          />
        ))}
      </div>

      <div className="mt-auto pt-6">
        <ContinueButton next="/explore" markStepComplete="notice">
          Continue 继续学习 <span aria-hidden>→</span>
        </ContinueButton>
      </div>
    </div>
  );
}
