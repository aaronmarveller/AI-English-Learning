import { ACTIVE_CONVERSATION_STATES } from "@/lib/conversation-state-machine";
import { getFocusGoal, type GoalProgress } from "@/lib/goal-progress";
import { GREETING_SOMEBODY_LESSON } from "@/content/lesson";

type ConversationProgressStepsProps = {
  /** The set of Conversation Goals achieved so far (ADR-0012) — the four markers are rendered from it, not from an index. */
  goalProgress: GoalProgress;
};

/**
 * The Practice page's own 4-marker inner conversation tracker (ticket 08;
 * spec.md user story 64: "看到四步对话进度并高亮当前步"). Visually distinct
 * from — and in addition to — the outer 5-dot Learning Flow header already
 * rendered by src/app/(learning)/layout.tsx (Observe/Explore/Notice/
 * Practice/Review); this one tracks the 4 Conversation Goals *inside*
 * Practice (Greeting/Check-in/Response/Closing), reusing the same dot/pill
 * idiom as that outer header since it reads well at this size too.
 *
 * Numbered-circle-and-connector styling (2026-08-07 UI draft) replaces the
 * original bar-segment look: the current marker is a solid navy circle
 * (matching --color-primary, the same "you are here" color the outer header
 * reserves for its own current dot), completed markers are solid accent-green,
 * and upcoming ones are outlined. The connector between two circles is filled
 * accent-green when its left-hand neighbor is completed-or-current, gray
 * otherwise — via each `<li>`'s `before:` pseudo-element spanning the left
 * half of its own flex-1 column plus (by width mirroring) the right half of
 * the previous column, the standard equal-width Tailwind stepper trick.
 *
 * A completed marker's two-line label also turns accent-green (2026-08-08 live
 * QA) — the current one's label stays neutral (it's still in progress, only its
 * circle is highlighted); only a Goal the learner has actually cleared gets the
 * "done" green treatment on its text too.
 *
 * Issue #47 (ADR-0012): one rendered marker per Conversation Goal, and that
 * Goal is **completed iff it is in Goal Progress** while the **current** one is
 * the Focus Goal — read off the set, not off how many markers are done, because
 * Goal Progress can be non-contiguous (a learner who says "Bye!" first has
 * `closing` completed while `greeting` stays current). The connector rule needs
 * no special case for a gap: it fills when its left neighbour is completed or
 * current, so a gap simply leaves the connector into the achieved Goal gray.
 * `data-state` keeps its three existing values ("completed"/"current"/
 * "upcoming") and every `data-testid` keeps its existing name, so the e2e
 * assertions written against the index-based version still hold.
 */
export function ConversationProgressSteps({ goalProgress }: ConversationProgressStepsProps) {
  const focusGoal = getFocusGoal(goalProgress);

  return (
    <ol
      aria-label="对话进度 Conversation progress"
      data-testid="conversation-progress-steps"
      className="flex items-start"
    >
      {ACTIVE_CONVERSATION_STATES.map((goal, index) => {
        const isCompleted = goalProgress.includes(goal);
        const isCurrent = !isCompleted && goal === focusGoal;
        const state = isCompleted ? "completed" : isCurrent ? "current" : "upcoming";
        // "Filled when the left neighbour is completed or current" — the same
        // rule the index-based version applied, and it needs no special case
        // for a gap: the connector leading out of an achievable run stays gray,
        // even where the Goal to its right is already completed.
        const leftNeighbour = index > 0 ? ACTIVE_CONVERSATION_STATES[index - 1] : null;
        const lineFilled =
          leftNeighbour !== null && (goalProgress.includes(leftNeighbour) || leftNeighbour === focusGoal);

        return (
          <li
            key={goal}
            data-testid={`practice-step-${goal}`}
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
                {GREETING_SOMEBODY_LESSON.script[goal].labelEn}
              </span>
              <span className={"text-caption " + (state === "completed" ? "text-accent" : "text-muted")}>
                {GREETING_SOMEBODY_LESSON.script[goal].labelZh}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
