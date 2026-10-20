"use client";

import { useState } from "react";
import { ContinueButton } from "@/components/continue-button";
import { CourseProgressChip } from "@/components/course-progress";
import { ChunkSection } from "@/components/explore/chunk-section";
import { ConversationFormula } from "@/components/explore/conversation-formula";
import { ExploreMore } from "@/components/explore/explore-more";
import { ExpressionCard, TINT_CYCLE, type ExpressionTint } from "@/components/explore/expression-card";
import { StageTag } from "@/components/stage-tag";
import {
  CONVERSATION_FORMULA,
  EXPLORE_HEADLINE,
  EXPLORE_SECTION_ORDER,
  EXPLORE_SECTIONS,
  type ExploreSectionKey,
  type FormulaRole,
} from "@/content/explore";
import { LESSON_STAGE_LABELS } from "@/content/lesson-stages";

const SECTION_ICONS: Record<ExploreSectionKey, string> = {
  greeting: "👋",
  checkin: "😊",
  response: "💬",
  closing: "👋",
};

const ROLE_TINT: Record<FormulaRole, ExpressionTint> = {
  respond: "green",
  "add-more": "blue",
  "ask-back": "yellow",
};

const ROLE_LABEL = Object.fromEntries(
  CONVERSATION_FORMULA.map((step) => [step.role, `${step.en} · ${step.zh}`]),
) as Record<FormulaRole, string>;

/**
 * Explore page body: four expression sections (Greeting, Check-in,
 * Response & Keep It Going, Closing) in one bordered container. Greeting
 * starts expanded; the sections form an accordion — opening one closes the
 * others. Continue is always reachable — nothing
 * here gates it.
 *
 * Split out from page.tsx (a Server Component, so it can keep exporting
 * `metadata` like every other learning page) because the open/closed state
 * here needs a Client Component.
 */
export function ExplorePageContent() {
  const [openSection, setOpenSection] = useState<ExploreSectionKey | null>("greeting");

  // Lifted here (not inside ChunkSection) so it survives the section's body unmounting.
  const [openMore, setOpenMore] = useState<Record<ExploreSectionKey, boolean>>({
    greeting: false,
    checkin: false,
    response: false,
    closing: false,
  });

  function toggleMore(key: ExploreSectionKey) {
    setOpenMore((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleSection(key: ExploreSectionKey) {
    setOpenSection((prev) => (prev === key ? null : key));
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <StageTag label="Explore" asHeading />
        <CourseProgressChip />
        <h2 className="text-[min(24px,6vw)] leading-8 font-bold whitespace-nowrap text-foreground">{EXPLORE_HEADLINE.en}</h2>
        <p className="text-body-lg text-muted">{EXPLORE_HEADLINE.zh}</p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-h3 text-foreground">
          <span aria-hidden>💬</span>
          Today&apos;s Expressions
        </h2>

        <div className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
          {EXPLORE_SECTION_ORDER.map((key) => {
            const label = LESSON_STAGE_LABELS[key];
            return (
              <ChunkSection
                key={key}
                icon={SECTION_ICONS[key]}
                titleEn={label.labelEn}
                titleZh={label.labelZhLong}
                open={openSection === key}
                onToggle={() => toggleSection(key)}
                testId={`section-${key}`}
              >
                <div className="flex flex-col gap-3">
                  {key === "response" && <ConversationFormula />}
                  {renderCards(key, "main")}
                  <ExploreMore
                    open={openMore[key]}
                    onToggle={() => toggleMore(key)}
                    subtitle={EXPLORE_SECTIONS[key].moreSubtitle}
                    testId={`explore-more-${key}`}
                  >
                    {renderCards(key, "more")}
                  </ExploreMore>
                </div>
              </ChunkSection>
            );
          })}
        </div>
      </div>

      <div className="mt-auto pt-6">
        <ContinueButton step="explore">
          Continue 继续学习 →
        </ContinueButton>
      </div>
    </div>
  );
}

/** Cards for one list; tint restarts from green per list (or follows the role in Response). */
function renderCards(key: ExploreSectionKey, list: "main" | "more") {
  if (key === "response") {
    return EXPLORE_SECTIONS.response[list].map((item) => (
      <ExpressionCard
        key={item.id}
        id={item.id}
        lines={item.lines}
        zh={item.zh}
        pill={ROLE_LABEL[item.role]}
        tint={ROLE_TINT[item.role]}
      />
    ));
  }
  return EXPLORE_SECTIONS[key][list].map((item, index) => (
    <ExpressionCard
      key={item.id}
      id={item.id}
      lines={item.lines}
      zh={item.zh}
      pill={item.tag}
      tint={TINT_CYCLE[index % TINT_CYCLE.length]}
    />
  ));
}
