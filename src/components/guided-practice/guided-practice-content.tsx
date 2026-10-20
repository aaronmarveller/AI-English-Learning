"use client";

import { useState, type ReactNode } from "react";
import { ContinueButton } from "@/components/continue-button";
import { CourseProgressChip } from "@/components/course-progress";
import { PronunciationButton } from "@/components/explore/pronunciation-button";
import { StageTag } from "@/components/stage-tag";
import { CONVERSATION_FORMULA, type FormulaRole } from "@/content/explore";
import {
  assembleResponse,
  CORE_EXPRESSIONS,
  feedbackFor,
  GUIDED_PRACTICE_HEADLINE,
  GUIDED_PRACTICE_STEPS,
  SITUATIONS,
  YOUR_RESPONSE_EMPTY,
  type Situation,
  type SituationId,
} from "@/content/guided-practice";
import { cancelSpeech } from "@/lib/speech-synthesis";

const ROLE_PILL_CLASSES: Record<FormulaRole, string> = {
  respond: "bg-accent-soft text-accent",
  "add-more": "bg-[#e8f0fb] text-[#2f6fd6]",
  "ask-back": "bg-[#fdf0dc] text-[#d98a1c]",
};

const ROLE_LABEL = Object.fromEntries(
  CONVERSATION_FORMULA.map((step) => [step.role, `${step.en} · ${step.zh}`]),
) as Record<FormulaRole, string>;

/**
 * Guided Practice page body (CONTEXT.md "Guided Practice"): pick one
 * Situation, tick any of the three core expressions, and read back the
 * assembled reply with feedback for that Situation. All state is in-memory —
 * every visit starts from the empty default — and nothing here gates
 * Continue.
 *
 * Audio is click-only and never overlaps: speech-synthesis.ts cancels
 * whatever is playing on every new `speak()`, and switching Situation
 * cancels too, since the old greeting's button is about to be disabled.
 */
export function GuidedPracticeContent() {
  const [situationId, setSituationId] = useState<SituationId | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  const situation = SITUATIONS.find((candidate) => candidate.id === situationId) ?? null;
  const response = assembleResponse(selectedIds);
  const feedback = situation ? feedbackFor(situation, selectedIds) : null;

  function chooseSituation(id: SituationId) {
    if (id === situationId) return;
    cancelSpeech();
    setSituationId(id);
  }

  function toggleExpression(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <StageTag label="Guided Practice" icon="💬" asHeading />
        <CourseProgressChip />
      </div>

      <h2 className="text-display text-foreground">{GUIDED_PRACTICE_HEADLINE}</h2>

      <section className="flex flex-col gap-3">
        <StepHeading
          number={1}
          title={GUIDED_PRACTICE_STEPS.situation.title}
          subtitle={GUIDED_PRACTICE_STEPS.situation.subtitle}
        />
        <div role="radiogroup" aria-label="场景 Situation" className="grid grid-cols-2 gap-3">
          {SITUATIONS.map((candidate) => (
            <SituationCard
              key={candidate.id}
              situation={candidate}
              selected={candidate.id === situationId}
              onSelect={() => chooseSituation(candidate.id)}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <StepHeading number={2} title={GUIDED_PRACTICE_STEPS.expressions.title} />
        <ul className="flex flex-col gap-2">
          {CORE_EXPRESSIONS.map((expression) => {
            const line = expression.lines[0];
            const checked = selectedIds.has(expression.id);
            const disabled = situation === null;
            return (
              <li
                key={expression.id}
                data-testid={`guided-expression-${expression.id}`}
                className={`flex items-center gap-3 rounded-card border border-border bg-card p-3 ${disabled ? "opacity-60" : ""}`}
              >
                <label className={`flex min-w-0 flex-1 items-center gap-3 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleExpression(expression.id)}
                    className="h-6 w-6 shrink-0 cursor-[inherit] accent-[#2fae60]"
                  />
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <span className="text-body-lg font-semibold text-foreground">{line}</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-body-sm text-muted">{expression.zh}</span>
                      <span
                        className={`whitespace-nowrap rounded-button px-2 py-0.5 text-caption ${ROLE_PILL_CLASSES[expression.role]}`}
                      >
                        {ROLE_LABEL[expression.role]}
                      </span>
                    </span>
                  </span>
                </label>
                <PronunciationButton
                  text={line}
                  disabled={disabled}
                  testId={`guided-pronounce-${expression.id}`}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-label="你的回答 Your Response"
        className="flex flex-col gap-3 rounded-card border border-border bg-card p-3"
      >
        <h3 className="flex items-center gap-2 text-body-lg font-medium text-foreground">
          <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef0f3]">
            ✏️
          </span>
          Your Response · 你的回答
        </h3>
        <div className="flex items-center gap-2 rounded-card bg-[#eef0f3] p-3">
          <p
            data-testid="your-response"
            className={`min-w-0 flex-1 ${response ? "text-body-lg text-foreground" : "text-body-sm text-muted"}`}
          >
            {response || YOUR_RESPONSE_EMPTY}
          </p>
          <PronunciationButton
            text={response}
            disabled={response === ""}
            label={`播放你的回答 Play your response: ${response}`}
            testId="guided-pronounce-response"
          />
        </div>
        {feedback ? (
          <div
            data-testid="guided-feedback"
            aria-live="polite"
            className="flex items-start gap-3 rounded-card bg-accent-soft p-4"
          >
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-h3 font-bold text-white"
            >
              ✓
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-h3 font-semibold text-accent">{feedback.en}</p>
              <p className="text-body-sm text-muted">{feedback.zh}</p>
            </div>
          </div>
        ) : null}
      </section>

      <div className="mt-auto pt-2">
        <ContinueButton next="/practice" markStepComplete="guided-practice">
          Continue 继续学习 →
        </ContinueButton>
      </div>
    </div>
  );
}

function StepHeading({ number, title, subtitle }: { number: number; title: string; subtitle?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-body-lg font-semibold text-accent">
        {number}
      </span>
      <div className="flex min-w-0 flex-col pt-1">
        <h3 className="text-body-lg font-bold text-foreground">{title}</h3>
        {subtitle ? <p className="text-body-sm text-muted">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function SituationCard({
  situation,
  selected,
  onSelect,
}: {
  situation: Situation;
  selected: boolean;
  onSelect: () => void;
}) {
  const [imageMissing, setImageMissing] = useState(false);

  // The select button is stretched over the whole card (inset-0) so tapping
  // anywhere picks the Situation, while the greeting's audio button sits
  // above it (z-10) — a button can't be nested inside another button.
  return (
    <div
      data-testid={`situation-${situation.id}`}
      data-selected={selected}
      className={`relative flex min-w-0 flex-col gap-2 rounded-card border-2 p-2 transition-colors ${
        selected ? "border-accent bg-accent-soft/50" : "border-border bg-card"
      }`}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={`${situation.name}: ${situation.greeting}`}
        onClick={onSelect}
        className="absolute inset-0 rounded-card"
      />
      <span className="pointer-events-none block aspect-[2/1] w-full overflow-hidden rounded-[14px] bg-accent-soft">
        {imageMissing ? (
          <span aria-hidden className="flex h-full items-center justify-center text-display">
            {situation.icon}
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a missing photo must fall back to the icon, not a broken layout.
          <img
            src={situation.image}
            alt={situation.imageAlt}
            onError={() => setImageMissing(true)}
            className="h-full w-full object-cover"
          />
        )}
      </span>
      <div className="pointer-events-none flex min-w-0 items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className={`flex items-center gap-1 text-body font-semibold ${selected ? "text-accent" : "text-muted"}`}
          >
            <span aria-hidden className={selected ? "" : "grayscale"}>
              {situation.icon}
            </span>
            {situation.name}
          </span>
          <span className="text-caption font-normal text-muted">“{situation.greeting}”</span>
        </div>
        <PronunciationButton
          text={situation.greeting}
          disabled={!selected}
          label={`播放问候 Play greeting: ${situation.greeting}`}
          testId={`guided-pronounce-greeting-${situation.id}`}
          className="pointer-events-auto relative z-10"
        />
      </div>
      {selected ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-accent text-body-sm font-bold text-white"
        >
          ✓
        </span>
      ) : null}
    </div>
  );
}
