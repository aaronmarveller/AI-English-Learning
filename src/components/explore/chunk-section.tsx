"use client";

import type { ReactNode } from "react";

type ChunkSectionProps = {
  /** Leading icon (emoji or a tinted icon) shown before the title. */
  icon?: ReactNode;
  titleEn: string;
  titleZh: string;
  open: boolean;
  onToggle: () => void;
  testId: string;
  children: ReactNode;
};

/**
 * One Explore section: a header that independently toggles its own body (no
 * accordion coupling — every section owns its own open/closed state in the
 * parent page, toggling one never touches the others). The header reads
 * "<icon> <English> · <中文>" with a green chevron (⌄ collapsed, ⌃ expanded).
 *
 * Header is a real `<button>` with the standard ARIA disclosure pattern
 * (`aria-expanded` + `aria-controls`). Sections are stacked inside one
 * bordered container by the parent, so this renders no border of its own.
 */
export function ChunkSection({ icon, titleEn, titleZh, open, onToggle, testId, children }: ChunkSectionProps) {
  const bodyId = `${testId}-body`;

  return (
    <section data-testid={testId} data-state={open ? "expanded" : "collapsed"}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        data-testid={`${testId}-header`}
        className="flex w-full items-center justify-between gap-2 px-4 py-4 text-left active:brightness-95"
        onClick={onToggle}
      >
        <span className="flex min-w-0 items-center gap-2">
          {icon ? <span aria-hidden>{icon}</span> : null}
          <span className="text-h3 text-foreground">
            {titleEn} · {titleZh}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-h3 text-accent" data-testid={`${testId}-chevron`}>
          {open ? "⌃" : "⌄"}
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
