"use client";

import { useState } from "react";
import { speak } from "@/lib/speech-synthesis";

type BubbleMessage = {
  textEn: string;
  textZh: string;
};

type MessageBubblePairProps = {
  /** Emily's current message, or null before the opening line has rendered. */
  emilyMessage: BubbleMessage | null;
  /** The learner's echoed input for the current turn, or null before they've submitted one. */
  learnerMessage: BubbleMessage | null;
  /**
   * Whether Emily's bubble should default to showing its Chinese caption
   * already expanded (ticket 10; spec.md 语言口径: "例外：第一条 Opening
   * Message 默认展开中文，降低初次入场门槛"). Every other message defaults to
   * collapsed. The parent is expected to pass `key={emilyMessage.id}` so this
   * component remounts (and its internal toggle state resets) on every new
   * message — see practice-page-content.tsx.
   */
  defaultShowChinese?: boolean;
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
 *
 * Ticket 10 additions (spec.md "Practice 页交互模型" / "语言口径", user
 * stories 48-53): a per-message bilingual subtitle toggle on Emily's bubble
 * (default collapsed, except the very first message in the whole
 * conversation — see `defaultShowChinese`), and an independent replay
 * button that re-speaks Emily's English line via the shared
 * speech-synthesis adapter. Neither one transitions Conversation State —
 * both are purely local UI state inside this component.
 */
export function MessageBubblePair({ emilyMessage, learnerMessage, defaultShowChinese = false }: MessageBubblePairProps) {
  const [showChinese, setShowChinese] = useState(defaultShowChinese);

  function handleReplay() {
    if (!emilyMessage) return;
    // Deliberately not awaited — the caption toggle and this replay must
    // stay fully independent, and there's nothing here to react to once
    // playback ends (see speak()'s doc comment: it never rejects).
    void speak(emilyMessage.textEn);
  }

  return (
    <div className="flex w-full flex-col gap-3" data-testid="message-bubble-pair">
      {emilyMessage ? (
        <div className="flex max-w-[85%] flex-col items-start gap-2 self-start">
          {/*
            IMPORTANT: `data-testid="emily-message-bubble"` must contain
            ONLY the English text, nothing else — e2e/practice-conversation.spec.ts
            (ticket 08, owned by a sibling worktree) asserts this element's
            text with an exact `toHaveText(...)` match. The Chinese caption
            and the toggle/replay controls below are deliberately rendered as
            SIBLINGS of this div, not children, so they never get folded
            into that assertion's text comparison.
          */}
          <div
            data-testid="emily-message-bubble"
            className="rounded-card bg-primary px-4 py-3 text-primary-foreground"
          >
            <p className="text-body-lg">{emilyMessage.textEn}</p>
          </div>
          {showChinese ? (
            <p
              data-testid="emily-message-zh"
              className="rounded-card bg-primary/10 px-4 py-2 text-body-sm text-foreground"
            >
              {emilyMessage.textZh}
            </p>
          ) : null}
          <div className="flex items-center gap-3 px-1">
            <button
              type="button"
              onClick={() => setShowChinese((current) => !current)}
              data-testid="subtitle-toggle-button"
              data-state={showChinese ? "expanded" : "collapsed"}
              className="text-caption text-muted underline underline-offset-2 active:scale-95 active:brightness-90"
            >
              中英字幕 Show Chinese
            </button>
            <button
              type="button"
              onClick={handleReplay}
              data-testid="replay-button"
              aria-label="重播 Replay"
              className="text-caption text-muted underline underline-offset-2 active:scale-95 active:brightness-90"
            >
              🔊 重播 Replay
            </button>
          </div>
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
