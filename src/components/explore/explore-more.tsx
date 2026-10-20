"use client";

import type { ReactNode } from "react";

type ExploreMoreProps = {
  open: boolean;
  onToggle: () => void;
  /** Section-specific subtitle; identical whether collapsed or expanded. */
  subtitle: string;
  testId: string;
  children: ReactNode;
};

/**
 * The optional "更多表达" group at the bottom of an Explore section. Controlled:
 * the parent owns the open state so it survives its section being collapsed
 * (ChunkSection unmounts its body when closed).
 */
export function ExploreMore({ open, onToggle, subtitle, testId, children }: ExploreMoreProps) {
  const bodyId = `${testId}-body`;

  return (
    <div data-testid={testId} data-state={open ? "expanded" : "collapsed"} className="flex min-w-0 flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        data-testid={`${testId}-toggle`}
        className="flex w-full items-center justify-between gap-3 rounded-card border border-border px-3 py-3 text-left active:brightness-95"
        onClick={onToggle}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            data-testid={`${testId}-icon`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-h3 text-accent"
          >
            {open ? "−" : "+"}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-body font-semibold text-foreground">更多表达</span>
            <span className="text-body-sm text-muted">{subtitle}</span>
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-h3 text-accent" data-testid={`${testId}-chevron`}>
          {open ? "⌃" : "⌄"}
        </span>
      </button>

      {open ? (
        <div id={bodyId} data-testid={bodyId} className="flex min-w-0 flex-col gap-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}
