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
 */
export function ConversationProgressSteps({ current }: ConversationProgressStepsProps) {
  const currentIndex =
    current === "complete" ? ACTIVE_CONVERSATION_STATES.length : ACTIVE_CONVERSATION_STATES.indexOf(current);

  return (
    <ol
      aria-label="对话进度 Conversation progress"
      data-testid="conversation-progress-steps"
      className="flex items-center gap-2"
    >
      {ACTIVE_CONVERSATION_STATES.map((step, index) => {
        const state = index < currentIndex ? "completed" : index === currentIndex ? "current" : "upcoming";
        return (
          <li
            key={step}
            data-testid={`practice-step-${step}`}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
            className="flex flex-1 flex-col items-center gap-1"
          >
            <span
              aria-hidden
              className={
                "h-2 w-full rounded-full transition-colors " +
                (state === "upcoming" ? "bg-border" : "bg-accent")
              }
            />
            <span className="text-caption text-muted">{PRACTICE_SCRIPT[step].labelZh}</span>
          </li>
        );
      })}
    </ol>
  );
}
