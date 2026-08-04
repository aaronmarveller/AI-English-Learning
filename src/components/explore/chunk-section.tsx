"use client";

import type { ReactNode } from "react";

type ChunkSectionProps = {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  testId: string;
  children: ReactNode;
};

/**
 * One Conversation Chunk Section: a header that independently toggles its
 * own body (no accordion coupling — every section owns its own open/closed
 * state in the parent page, toggling one never touches the others).
 *
 * Header is a real `<button>` with the standard ARIA disclosure pattern
 * (`aria-expanded` + `aria-controls`) — e2e/navigation-spine.spec.ts's
 * shared walkthrough test scopes its own button query by accessible name
 * (`/Continue/`), so this page doesn't need to avoid the "button" role to
 * keep that query unambiguous.
 */
export function ChunkSection({ title, subtitle, open, onToggle, testId, children }: ChunkSectionProps) {
  const bodyId = `${testId}-body`;

  return (
    <section
      data-testid={testId}
      data-state={open ? "expanded" : "collapsed"}
      className="rounded-card border border-border bg-card"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        data-testid={`${testId}-header`}
        className="flex w-full items-center justify-between px-4 py-4 text-left active:brightness-95"
        onClick={onToggle}
      >
        <span className="flex items-baseline gap-2">
          <span className="text-h3 text-foreground">{title}</span>
          <span className="text-body-sm text-muted">{subtitle}</span>
        </span>
        <span
          aria-hidden
          className={`text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          ⌄
        </span>
      </button>

      {open ? (
        <div id={bodyId} data-testid={bodyId} className="min-w-0 px-4 pb-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}
