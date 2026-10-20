import { Fragment } from "react";
import { CONVERSATION_FORMULA } from "@/content/explore";

/**
 * The Conversation Formula panel shown at the top of Response & Keep It Going:
 * three numbered steps joined by → arrows. Taught only — nothing here is
 * clickable or audible. On narrow screens the steps wrap onto their own rows.
 */
export function ConversationFormula() {
  return (
    <div
      data-testid="conversation-formula"
      className="flex flex-col gap-3 rounded-card bg-accent-soft p-4"
    >
      <h3 className="text-h3 font-semibold text-foreground">Conversation Formula 交流公式</h3>
      <div className="flex flex-wrap items-stretch gap-x-2 gap-y-2">
        {CONVERSATION_FORMULA.map((step, index) => (
          <Fragment key={step.role}>
            {index > 0 && (
              <span aria-hidden className="self-center text-body-lg text-muted">
                →
              </span>
            )}
            <div
              data-testid={`formula-step-${step.order}`}
              className="flex min-w-0 flex-1 basis-24 flex-col items-center gap-1 rounded-card bg-white/70 p-2 text-center"
            >
              <span
                data-testid="formula-number"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-caption font-semibold text-white"
              >
                {step.order}
              </span>
              <span data-testid="formula-en" className="text-body-sm font-semibold text-foreground">
                {step.en}
              </span>
              <span data-testid="formula-zh" className="text-body-sm text-muted">
                {step.zh}
              </span>
              <span
                data-testid="formula-hint"
                className="w-fit rounded-button bg-accent-soft px-2 py-1 text-caption text-foreground"
              >
                {step.hint}
              </span>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
