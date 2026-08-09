import { ACTIVE_CONVERSATION_STATES, type ConversationState } from "@/lib/conversation-state-machine";
import { PRACTICE_SCRIPT } from "@/content/practice";

type ConversationProgressStepsProps = {
  current: ConversationState;
};

/**
 * The Practice page's own 4-step inner conversation tracker (ticket 08;
 * spec.md user story 64: "看到四步对话进度并高亮当前步"). Visually distinct
 * from — and in addition to — the outer 5-dot Learning Flow header already
 * rendered by src/app/(learning)/layout.tsx (Observe/Explore/Notice/
 * Practice/Review); this one tracks the 4 states *inside* Practice
 * (Greeting/Check-in/Response/Closing), reusing the same dot/pill idiom as
 * that outer header since it reads well at this size too.
 *
 * Numbered-circle-and-connector styling (2026-08-07 UI draft) replaces the
 * original bar-segment look: current step is a solid navy circle (matching
 * --color-primary, the same "you are here" color the outer header reserves
 * for its own current dot), completed steps are solid accent-green, and
 * upcoming steps are outlined. The connector between two circles is filled
 * accent-green when its left-hand neighbor is completed-or-current, gray
 * otherwise — via each `<li>`'s `before:` pseudo-element spanning the left
 * half of its own flex-1 column plus (by width mirroring) the right half of
 * the previous column, the standard equal-width Tailwind stepper trick.
 *
 * A completed step's two-line label also turns accent-green (2026-08-08 live
 * QA) — the current step's label stays neutral (it's still in progress, only
 * its circle is highlighted); only a step the learner has actually cleared
 * gets the "done" green treatment on its text too.
 */
export function ConversationProgressSteps({ current }: ConversationProgressStepsProps) {
  const currentIndex =
    current === "complete" ? ACTIVE_CONVERSATION_STATES.length : ACTIVE_CONVERSATION_STATES.indexOf(current);

  return (
    <ol
      aria-label="对话进度 Conversation progress"
      data-testid="conversation-progress-steps"
      className="flex items-start"
    >
      {ACTIVE_CONVERSATION_STATES.map((step, index) => {
        const state = index < currentIndex ? "completed" : index === currentIndex ? "current" : "upcoming";
        const lineFilled = index > 0 && index <= currentIndex;

        return (
          <li
            key={step}
            data-testid={`practice-step-${step}`}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
            className={
              "relative flex flex-1 flex-col items-center gap-1.5 before:absolute before:right-1/2 before:top-3.5 before:h-0.5 before:w-full before:content-[''] first:before:content-none " +
              (lineFilled ? "before:bg-accent" : "before:bg-border")
            }
          >
            <span
              aria-hidden
              className={
                "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold transition-colors " +
                (state === "current"
                  ? "bg-primary text-primary-foreground"
                  : state === "completed"
                    ? "bg-accent text-accent-foreground"
                    : "border border-border bg-card text-muted")
              }
            >
              {index + 1}
            </span>
            <span className="flex flex-col items-center gap-0.5 text-center">
              <span
                className={
                  "text-caption font-medium " + (state === "completed" ? "text-accent" : "text-foreground")
                }
              >
                {PRACTICE_SCRIPT[step].labelEn}
              </span>
              <span className={"text-caption " + (state === "completed" ? "text-accent" : "text-muted")}>
                {PRACTICE_SCRIPT[step].labelZh}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
