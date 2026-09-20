"use client";

import { useState } from "react";
import { speakLines } from "@/lib/speech-synthesis";

type BubbleMessage = {
  textEn: string;
  textZh: string;
};

type MessageBubblePairProps = {
  /**
   * The Emily lines of the current turn, in the order Emily spoke them — an
   * empty array before the opening line has rendered. A Turn can be answered
   * by more than one Conversation Script line (issue #48), so this is a list;
   * it renders as one bubble (see the doc comment below).
   */
  emilyMessages: readonly BubbleMessage[];
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
 *
 * Ticket 10 additions (spec.md "Practice 页交互模型" / "语言口径", user
 * stories 48-53): a per-message bilingual subtitle toggle on Emily's bubble
 * (default collapsed for every new message), and an independent replay
 * button that re-speaks Emily's English line via the shared
 * speech-synthesis adapter. Neither one transitions Conversation State —
 * both are purely local UI state inside this component.
 *
 * Issue #48: one Turn's several Emily lines render as ONE bubble, joined in
 * order — the bubble is "what Emily just said", and splitting it into several
 * `emily-message-bubble` elements would both fragment that reading (her lines
 * are already shown as a sequence in the transcript) and change what every
 * existing assertion against that testid matches.
 *
 * The replay button re-speaks those lines one at a time, from each line's own
 * pre-generated file (`speakLines`) — NOT by handing the joined text to
 * `speak()`, which matches no audio manifest entry by construction and would
 * skip ADR-0005's pre-generated audio for a paid live-TTS round-trip. One
 * `speakLines` call also holds the floor across the whole replay rather than
 * handing the mic back between the lines, exactly as the automatic playback
 * does. A single-line Turn is unaffected: `speakLines([text])` is what
 * `speak(text)` does.
 */
export function MessageBubblePair({ emilyMessages, learnerMessage }: MessageBubblePairProps) {
  const [showChinese, setShowChinese] = useState(false);

  const emilyTextEn = emilyMessages.map((message) => message.textEn).join(" ");
  const emilyTextZh = emilyMessages.map((message) => message.textZh).join(" ");

  function handleReplay() {
    if (emilyMessages.length === 0) return;
    // Deliberately not awaited — the caption toggle and this replay must
    // stay fully independent, and there's nothing here to react to once
    // playback ends (see speakLines()'s doc comment: it never rejects).
    void speakLines(emilyMessages.map((message) => message.textEn));
  }

  return (
    <div className="flex w-full flex-col gap-2" data-testid="message-bubble-pair">
      {emilyMessages.length > 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-card bg-foreground/80 p-3 text-primary-foreground shadow-lg backdrop-blur-sm">
          {/*
            IMPORTANT: `data-testid="emily-message-bubble"` must contain
            ONLY the English text, nothing else — e2e/practice-conversation.spec.ts
            (ticket 08, owned by a sibling worktree) asserts this element's
            text with an exact `toHaveText(...)` match. The Chinese caption
            and the toggle/replay controls below are deliberately rendered as
            SIBLINGS of this div, not children, so they never get folded
            into that assertion's text comparison.

            One Turn's several lines are one paragraph, joined in order
            (issue #48) — see this component's doc comment.
          */}
          <p data-testid="emily-message-bubble" className="text-body-lg">
            {emilyTextEn}
          </p>
          {showChinese ? (
            <p data-testid="emily-message-zh" className="text-body-sm text-primary-foreground/80">
              {emilyTextZh}
            </p>
          ) : null}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleReplay}
              data-testid="replay-button"
              aria-label="重播 Replay"
              className="btn-icon-pressed rounded-button bg-primary-foreground/15 px-3 py-1.5 text-caption font-medium text-primary-foreground"
            >
              🔊 重播 Replay
            </button>
            <button
              type="button"
              onClick={() => setShowChinese((current) => !current)}
              data-testid="subtitle-toggle-button"
              data-state={showChinese ? "expanded" : "collapsed"}
              className="btn-icon-pressed rounded-button bg-primary-foreground/15 px-3 py-1.5 text-caption font-medium text-primary-foreground"
            >
              🖼 中英字幕 Show Chinese
            </button>
          </div>
        </div>
      ) : null}

      {learnerMessage ? (
        <div
          data-testid="learner-message-bubble"
          className="max-w-[85%] self-end rounded-card bg-accent-soft px-4 py-3 text-foreground shadow-lg"
        >
          <p className="text-body-lg">{learnerMessage.textEn}</p>
        </div>
      ) : null}
    </div>
  );
}
