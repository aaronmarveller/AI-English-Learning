type BubbleMessage = {
  textEn: string;
};

type MessageBubblePairProps = {
  /** Emily's current message, or null before the opening line has rendered. */
  emilyMessage: BubbleMessage | null;
  /** The learner's echoed input for the current turn, or null before they've submitted one. */
  learnerMessage: BubbleMessage | null;
};

/**
 * The current-turn double bubble (ticket 08; spec.md "Practice 页交互模型":
 * "当前轮双气泡...Emily 消息在上、学习者输入回显在下；进入下一轮时两条淡出
 * 替换"). This intentionally shows only the *current* turn, not a growing
 * chat log — src/lib/practice-state.ts already records every message in
 * order so ticket 10's collapsible full-transcript drawer has data to
 * render; this component just isn't that drawer.
 *
 * The learner's input MUST be echoed back verbatim (spec.md: "初学者发音不
 * 准时识别常出错，若不回显，学习者只会反复收到...而无法归因，会当场卡死") —
 * this ticket only wires text input, but the same echo requirement applies
 * to typed text just as much as speech-recognized text.
 */
export function MessageBubblePair({ emilyMessage, learnerMessage }: MessageBubblePairProps) {
  return (
    <div className="flex w-full flex-col gap-3" data-testid="message-bubble-pair">
      {emilyMessage ? (
        <div
          data-testid="emily-message-bubble"
          className="max-w-[85%] self-start rounded-card bg-primary px-4 py-3 text-primary-foreground"
        >
          <p className="text-body-lg">{emilyMessage.textEn}</p>
        </div>
      ) : null}

      {learnerMessage ? (
        <div
          data-testid="learner-message-bubble"
          className="max-w-[85%] self-end rounded-card bg-accent-soft px-4 py-3 text-foreground"
        >
          <p className="text-body-lg">{learnerMessage.textEn}</p>
        </div>
      ) : null}
    </div>
  );
}
