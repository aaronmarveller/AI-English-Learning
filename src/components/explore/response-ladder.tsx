import type { ResponseStep } from "@/content/explore";
import { PronunciationButton } from "@/components/explore/pronunciation-button";

const STEP_MARKERS = ["①", "②", "③"] as const;

type ResponseLadderProps = {
  steps: ResponseStep[];
  combo: { id: string; expression: string };
};

/**
 * 回应 section's vertical 3-step ladder — deliberately NOT a carousel
 * (spec.md "命名与内容修正": a carousel would let a learner scroll to step ②
 * without ①/③ ever being visible together, losing the "these three read as
 * one" teaching point). Steps render in fixed DOM order with ①②③ markers
 * connected by a vertical line on the left; below them, a highlighted combo
 * card shows the full 3-sentence combination with its own pronunciation
 * control.
 */
export function ResponseLadder({ steps, combo }: ResponseLadderProps) {
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <li key={step.id} data-testid={`response-step-${index + 1}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span aria-hidden className="text-h3 leading-none text-accent">
                {STEP_MARKERS[index]}
              </span>
              {index < steps.length - 1 ? (
                <span aria-hidden className="mt-1 w-px flex-1 bg-border" />
              ) : null}
            </div>
            <div className="flex flex-1 items-start justify-between gap-2 rounded-card border border-border bg-card p-3 mb-3">
              <div className="flex flex-col gap-1">
                <p className="text-body-lg font-medium text-foreground">{step.expression}</p>
                <p className="text-body-sm text-muted">{step.hint}</p>
              </div>
              <PronunciationButton text={step.expression} testId={`pronounce-${step.id}`} />
            </div>
          </li>
        ))}
      </ol>

      <div
        data-testid="response-combo"
        className="flex items-start justify-between gap-3 rounded-card border-2 border-accent bg-accent-soft p-4"
      >
        <div className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-accent">连起来说 Say it as one</span>
          <p className="text-body-lg font-medium text-foreground">{combo.expression}</p>
        </div>
        <PronunciationButton text={combo.expression} testId={`pronounce-${combo.id}`} />
      </div>
    </div>
  );
}
