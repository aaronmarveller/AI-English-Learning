"use client";

import type { ReactNode } from "react";
import { ChinaFlagIcon, UsFlagIcon } from "@/components/notice/flag-icon";
import type { CulturalInsightCard } from "@/content/notice";

type NoticeCardProps = {
  /** 1-based position, rendered in the leading numbered circle. */
  index: number;
  card: CulturalInsightCard;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/**
 * One Cultural Insight Card on the Notice page: a numbered header that
 * shows a compact emoji preview strip while collapsed, and the full
 * US/China/why comparison (via `children`, CulturalComparisonBody) once
 * expanded.
 *
 * Deliberately a Notice-only component rather than a reuse of
 * src/components/explore/chunk-section.tsx (UI draft, 2026-08-07 review):
 * the numbered circle and collapsed preview strip don't apply to Explore's
 * sections, and forcing them into the shared component would mean every
 * Explore call site carries props it never uses.
 *
 * Preserves the same data-testid/data-state/ARIA shape the previous
 * ChunkSection-based markup had (`{testId}`, `{testId}-header`,
 * `{testId}-body`, `data-state="expanded"|"collapsed"`) so
 * e2e/notice.spec.ts's accordion coverage keeps working unchanged.
 */
export function NoticeCard({ index, card, open, onToggle, children }: NoticeCardProps) {
  const testId = card.id;
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
        className="flex w-full items-start gap-3 px-4 py-4 text-left active:brightness-95"
        onClick={onToggle}
      >
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent text-caption font-semibold text-accent"
        >
          {index}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-3">
          <span className="text-h3 text-foreground">{card.title}</span>
          {!open ? (
            <span aria-hidden className="flex w-full flex-nowrap items-center justify-between gap-2">
              <span className="flex shrink-0 flex-nowrap items-center gap-1.5 whitespace-nowrap">
                <UsFlagIcon className="h-8 w-8 shrink-0 rounded-[2px] object-contain" />
                <span className="whitespace-nowrap text-[32px] leading-none">{card.preview.us}</span>
              </span>
              <span className="shrink-0 text-caption text-muted">VS</span>
              <span className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                <span className="whitespace-nowrap text-[32px] leading-none">{card.preview.china}</span>
                <ChinaFlagIcon className="h-8 w-8 shrink-0 rounded-[2px] object-contain" />
              </span>
            </span>
          ) : null}
        </span>

        <span
          aria-hidden
          className={`shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        >
          ›
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
