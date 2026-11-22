import { Fragment } from "react";
import { CONVERSATION_FORMULA, type FormulaRole } from "@/content/explore";

/**
 * The Conversation Formula panel shown at the top of Response & Keep It Going:
 * three numbered steps joined by → arrows. Each step is a button that highlights its
 * matching Response card (state lives in the page); it never plays audio. The steps
 * always share one row, shrinking to fit narrow screens.
 */
export function ConversationFormula({
  selected,
  onSelect,
}: {
  selected: FormulaRole | null;
  onSelect: (role: FormulaRole) => void;
}) {
  return (
    <div
      data-testid="conversation-formula"
      className="flex flex-col gap-2 rounded-card bg-accent-soft p-3"
    >
      <h3 className="text-h3 font-semibold text-foreground">Conversation Formula 交流公式</h3>
      <div className="flex flex-nowrap items-stretch gap-x-1">
        {CONVERSATION_FORMULA.map((step, index) => (
          <Fragment key={step.role}>
            {index > 0 && (
              <span aria-hidden className="self-center text-body-sm text-muted">
                →
              </span>
            )}
            <button
              type="button"
              aria-pressed={selected === step.role}
              data-testid={`formula-step-${step.order}`}
              onClick={() => onSelect(step.role)}
              className={`flex min-w-0 flex-1 basis-0 flex-col items-center gap-1 rounded-card border-2 px-1 py-2 text-center transition-colors duration-[220ms] active:brightness-95 ${
                selected === step.role ? "border-accent bg-white" : "border-transparent bg-white/70"
              }`}
            >
              <span
                data-testid="formula-number"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-caption font-semibold text-white"
              >
                {step.order}
              </span>
              <span data-testid="formula-en" className="text-[13px] leading-5 font-semibold whitespace-nowrap text-foreground">
                {step.en}
              </span>
              <span data-testid="formula-zh" className="text-[13px] leading-5 whitespace-nowrap text-muted">
                {step.zh}
              </span>
              <span
                data-testid="formula-hint"
                className="w-fit rounded-button bg-accent-soft px-1.5 py-1 text-[11px] leading-4 text-foreground"
              >
                {step.hint}
              </span>
            </button>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
