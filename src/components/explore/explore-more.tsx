"use client";

import { useEffect, useState, type ReactNode } from "react";

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

  // The body mounts on first open and then stays mounted so the close fade can play (T-010).
  // `entered` lags `open` by a frame on the way in so the opacity transition has a start value.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const [entered, setEntered] = useState(open);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => {
      cancelAnimationFrame(frame);
      setEntered(false);
    };
  }, [open]);
  const shown = open && entered;

  return (
    <div data-testid={testId} data-state={open ? "expanded" : "collapsed"} className="flex min-w-0 flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        data-testid={`${testId}-toggle`}
        className="flex w-full items-center justify-between gap-3 rounded-card border border-border px-3 py-1 text-left active:brightness-95"
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
            <span className="text-body leading-5 font-semibold text-foreground">更多表达</span>
            <span className="text-body-sm leading-4 text-muted">{subtitle}</span>
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-h3 text-accent" data-testid={`${testId}-chevron`}>
          {open ? "⌃" : "⌄"}
        </span>
      </button>

      {mounted ? (
        <div
          id={bodyId}
          data-testid={bodyId}
          data-open={shown}
          aria-hidden={!shown}
          className="fade-body flex min-w-0 flex-col gap-2"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
