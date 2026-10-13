"use client";

import { useEffect, useRef } from "react";
import type { CallLine } from "@/lib/call-engine";

type CallTranscriptProps = {
  /** The latest Call's bubbles, in order, in the language they were spoken. */
  lines: readonly CallLine[];
};

/**
 * The latest Call's Turns as chat bubbles: Emily's on the left, the learner's
 * on the right. No Chinese translation — each bubble is what was actually
 * said. A learner bubble whose transcript has not arrived yet shows "…".
 */
export function CallTranscript({ lines }: CallTranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [lines]);

  return (
    <div
      data-testid="call-transcript"
      className="flex max-h-72 min-h-24 flex-col gap-2 overflow-y-auto rounded-card border border-border bg-card p-3"
    >
      {lines.length === 0 ? (
        <p className="m-auto text-center text-body-sm text-muted">点击「开始对话」，和 Emily 打个电话吧。</p>
      ) : null}
      {lines.map((line) =>
        line.role === "emily" ? (
          <div
            key={line.id}
            data-testid="emily-message-bubble"
            className="max-w-[85%] self-start rounded-card bg-foreground/80 px-4 py-3 text-body-lg text-primary-foreground"
          >
            {line.text || "…"}
          </div>
        ) : (
          <div
            key={line.id}
            data-testid="learner-message-bubble"
            className="max-w-[85%] self-end rounded-card bg-accent-soft px-4 py-3 text-body-lg text-foreground"
          >
            {line.text || "…"}
          </div>
        ),
      )}
      <div ref={endRef} />
    </div>
  );
}
