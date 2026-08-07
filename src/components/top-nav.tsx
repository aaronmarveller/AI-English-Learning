import type { ReactNode } from "react";
import { HomeIcon, ProfileIcon, ProgressIcon } from "@/components/icons";

/**
 * Shared top bar for every page: a left-hand slot (Home's logo lockup, or
 * the learning pages' back-to-Home link) plus the persistent Home/Progress/
 * Profile nav on the right. Progress and Profile stay non-interactive stubs
 * (neither page exists in this MVP) but now carry the icon+label treatment
 * the UI draft specifies instead of a bare icon.
 *
 * Icons are src/components/icons.tsx's `currentColor` line-icon set, not
 * emoji (UI draft, 2026-08-07 review) — see that file's docstring for why.
 */
export function TopNav({ left }: { left?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      {left ? <div className="min-w-0">{left}</div> : null}

      <nav
        aria-label="主导航 Main navigation"
        className={
          left ? "flex shrink-0 items-center gap-4" : "flex w-full items-center justify-between"
        }
      >
        <span className="flex items-center gap-1 text-body-sm font-semibold text-foreground">
          <HomeIcon className="h-[18px] w-[18px]" />
          <span className="border-b-2 border-primary pb-0.5">Home</span>
        </span>
        <span aria-hidden data-testid="progress-stub" className="flex items-center gap-1 text-body-sm text-muted">
          <ProgressIcon className="h-[18px] w-[18px]" />
          <span>Progress</span>
        </span>
        <span aria-hidden data-testid="profile-stub" className="flex items-center gap-1 text-body-sm text-muted">
          <ProfileIcon className="h-[18px] w-[18px]" />
          <span>Profile</span>
        </span>
      </nav>
    </div>
  );
}
