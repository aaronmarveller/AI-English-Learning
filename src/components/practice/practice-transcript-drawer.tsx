"use client";

/**
 * Full conversation transcript drawer (ticket 10; spec.md "Practice 页交互
 * 模型": "完整对话记录收在可展开的抽屉里，不占主视觉"; user story 67: "能展开
 * 查看完整对话记录").
 *
 * Self-contained: reads `messages` from the practice store itself via
 * `usePractice()`, so the parent (practice-page-content.tsx) only needs to
 * drop `<PracticeTranscriptDrawer />` into the JSX with no props. Purely a
 * read view — toggling it open/closed never touches the practice store.
 */

import { useState } from "react";
import { usePractice } from "@/lib/practice-state";

export function PracticeTranscriptDrawer() {
  const { messages } = usePractice();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-card border border-border bg-card">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        data-testid="transcript-toggle-button"
        data-state={isOpen ? "expanded" : "collapsed"}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-4 py-3 text-body font-medium text-foreground active:scale-[0.99] active:brightness-95"
      >
        <span>完整对话记录 Full transcript</span>
        <span aria-hidden>{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen ? (
        <ul data-testid="transcript-message-list" className="flex flex-col gap-2 border-t border-border p-4">
          {messages.length === 0 ? (
            <li className="text-body-sm text-muted">对话还没开始。</li>
          ) : (
            messages.map((message) => (
              <li
                key={message.id}
                data-testid="transcript-message"
                data-role={message.role}
                className={
                  "max-w-[90%] rounded-card px-3 py-2 text-body-sm " +
                  (message.role === "emily"
                    ? "self-start bg-primary/10 text-foreground"
                    : "self-end bg-accent-soft text-foreground")
                }
              >
                <p className="text-caption text-muted">{message.role === "emily" ? "Emily" : "你 You"}</p>
                <p>{message.textEn}</p>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
