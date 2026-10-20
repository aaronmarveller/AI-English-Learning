import type { ReactNode } from "react";
import { HomeIcon } from "@/components/icons";

/**
 * Shared top bar for every page. Learning pages pass a left-hand slot (the
 * back-to-Home link) and hide the nav; Home shows `showStubNav`, which renders
 * only a non-interactive "Home" tab — the current-page underline over a
 * hairline that runs the full header width. Progress and Profile have no
 * pages yet, so they are not offered at all.
 *
 * Icons are src/components/icons.tsx's `currentColor` line-icon set, not
 * emoji (UI draft, 2026-08-07 review) — see that file's docstring for why.
 */
export function TopNav({ left, showStubNav = true }: { left?: ReactNode; showStubNav?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      {left ? <div className="min-w-0">{left}</div> : null}

      {showStubNav ? (
        <nav
          aria-label="主导航 Main navigation"
          className={
            left
              ? "flex shrink-0 items-center gap-3"
              : "-mx-5 -mt-6 flex w-[calc(100%+2.5rem)] items-end border-b border-border px-5 pt-4"
          }
        >
          <span
            aria-current="page"
            className="-mb-px flex items-center gap-1 border-b-2 border-primary pb-2 text-caption font-semibold text-foreground"
          >
            <HomeIcon className="h-3.5 w-3.5" />
            <span>Home</span>
          </span>
        </nav>
      ) : null}
    </div>
  );
}
