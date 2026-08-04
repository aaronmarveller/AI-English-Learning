"use client";

import { useState } from "react";
import { ContinueButton } from "@/components/continue-button";
import { ChunkSection } from "@/components/explore/chunk-section";
import { ExpressionCarousel } from "@/components/explore/expression-carousel";
import { ResponseLadder } from "@/components/explore/response-ladder";
import {
  EXPLORE_SECTION_ORDER,
  EXPLORE_SECTIONS,
  RESPONSE_COMBO,
  RESPONSE_STEPS,
  type ExploreSectionKey,
} from "@/content/explore";

/**
 * Explore page body: the lesson's 12 Key Expressions grouped into 4
 * Conversation Chunk Sections (打招呼/问候/回应/结束对话). Only 打招呼
 * starts expanded; every section toggles independently and multiple can be
 * open at once (not an accordion). Continue is always reachable — nothing
 * here gates it, per spec.md user story 34.
 *
 * Split out from page.tsx (a Server Component, so it can keep exporting
 * `metadata` like every other learning page) because the open/closed state
 * here needs a Client Component.
 */
export function ExplorePageContent() {
  const [openSections, setOpenSections] = useState<Record<ExploreSectionKey, boolean>>({
    greeting: true,
    checkin: false,
    response: false,
    closing: false,
  });

  function toggleSection(key: ExploreSectionKey) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Explore</h1>
        <p className="text-body text-muted">
          按对话的四个环节学习本节的核心表达——学的是成块的话，不是单词。点喇叭听发音，可以反复听。
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {EXPLORE_SECTION_ORDER.map((key) => {
          const testId = `section-${key}`;
          const open = openSections[key];

          if (key === "response") {
            return (
              <ChunkSection
                key={key}
                title="回应"
                subtitle="Response"
                open={open}
                onToggle={() => toggleSection(key)}
                testId={testId}
              >
                <ResponseLadder steps={RESPONSE_STEPS} combo={RESPONSE_COMBO} />
              </ChunkSection>
            );
          }

          const section = EXPLORE_SECTIONS[key];
          return (
            <ChunkSection
              key={key}
              title={section.title}
              subtitle={section.subtitle}
              open={open}
              onToggle={() => toggleSection(key)}
              testId={testId}
            >
              <ExpressionCarousel cards={section.expressions} testId={`${testId}-carousel`} />
            </ChunkSection>
          );
        })}
      </div>

      <div className="mt-auto pt-6">
        <ContinueButton next="/notice" markStepComplete="explore">
          继续 Continue
        </ContinueButton>
      </div>
    </div>
  );
}
