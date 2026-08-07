import type { ReactNode } from "react";

/**
 * Shared top bar for every page: a left-hand slot (Home's logo lockup, or
 * the learning pages' back-to-Home link) plus the persistent Home/Progress/
 * Profile nav on the right. Progress and Profile stay non-interactive stubs
 * (neither page exists in this MVP) but now carry the icon+label treatment
 * the UI draft specifies instead of a bare icon.
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
          <span aria-hidden>🏠</span>
          <span className="border-b-2 border-primary pb-0.5">Home</span>
        </span>
        <span aria-hidden data-testid="progress-stub" className="flex items-center gap-1 text-body-sm text-muted">
          <span>📊</span>
          <span>Progress</span>
        </span>
        <span aria-hidden data-testid="profile-stub" className="flex items-center gap-1 text-body-sm text-muted">
          <span>👤</span>
          <span>Profile</span>
        </span>
      </nav>
    </div>
  );
}
