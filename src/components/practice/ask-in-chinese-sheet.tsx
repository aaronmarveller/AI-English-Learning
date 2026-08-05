"use client";

/**
 * Ask-in-Chinese bottom sheet (ticket 10; spec.md "Practice 页交互模型":
 * "Ask in Chinese 不调用大模型...四段内容对每个 Conversation State 都是固定的,
 * 写成预设文案即可——零延迟、零成本、结果可控。以底部 Sheet 呈现"; user stories
 * 54-57).
 *
 * Reads its 4-part content straight from src/content/practice.ts's
 * `ASK_IN_CHINESE_HELP`, keyed by the live `conversationState` passed down
 * from practice-page-content.tsx — no model call, no network request.
 * Opening and closing this sheet is pure local UI state; it never touches
 * the practice store (`conversationState` / `messages` / `highlightKeys`),
 * so it can never advance or reset the conversation (user story 57: "用了
 * 中文帮助之后对话仍停在原来那一步"). The content itself explains the current
 * step but stops short of handing over the literal expected sentence as
 * a fill-in-the-blank answer (user story 56: "中文帮助不替我回答").
 */

import { ASK_IN_CHINESE_HELP } from "@/content/practice";
import type { ActiveConversationState } from "@/lib/conversation-state-machine";

type AskInChineseSheetProps = {
  conversationState: ActiveConversationState;
  onClose: () => void;
};

export function AskInChineseSheet({ conversationState, onClose }: AskInChineseSheetProps) {
  const help = ASK_IN_CHINESE_HELP[conversationState];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-foreground/40"
      data-testid="ask-in-chinese-backdrop"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="中文提问 Ask in Chinese"
        data-testid="ask-in-chinese-sheet"
        className="rounded-card border border-border bg-card p-5"
        // Stop clicks inside the sheet from bubbling to the backdrop's close handler.
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-h3">中文提问 Ask in Chinese</h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="ask-in-chinese-close-button"
            aria-label="关闭 Close"
            className="btn-icon-pressed text-body-lg text-muted"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 text-body">
          <div>
            <p className="text-body-sm font-semibold text-muted">这句是什么意思</p>
            <p>{help.meaning}</p>
          </div>
          <div>
            <p className="text-body-sm font-semibold text-muted">什么时候用</p>
            <p>{help.whenToUse}</p>
          </div>
          <div>
            <p className="text-body-sm font-semibold text-muted">举个例子</p>
            <p>{help.example}</p>
          </div>
          <div>
            <p className="text-body-sm font-semibold text-muted">继续加油</p>
            <p>{help.encouragement}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
