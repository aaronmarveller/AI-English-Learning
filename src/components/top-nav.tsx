"use client";

import type { ReactNode } from "react";
import { ComingSoonToast, useComingSoonToast } from "@/components/coming-soon-toast";
import { HomeIcon, ProfileIcon, ProgressIcon } from "@/components/icons";

/**
 * Shared top bar for every page: a left-hand slot (Home's logo lockup, or
 * the learning pages' back-to-Home link) plus the persistent Home/Progress/
 * Profile nav on the right. Progress and Profile have no destination yet
 * (neither page exists in this MVP), so tapping either just surfaces the
 * "正在制作中" toast instead of navigating anywhere.
 *
 * Icons are src/components/icons.tsx's `currentColor` line-icon set, not
 * emoji (UI draft, 2026-08-07 review) — see that file's docstring for why.
 */
export function TopNav({ left, showStubNav = true }: { left?: ReactNode; showStubNav?: boolean }) {
  const { visible, show } = useComingSoonToast();

  return (
    <div className="flex items-center justify-between gap-3">
      {left ? <div className="min-w-0">{left}</div> : null}

      {showStubNav ? <nav
        aria-label="主导航 Main navigation"
        className={
          left ? "flex shrink-0 items-center gap-3" : "flex w-full items-center justify-between"
        }
      >
        <span className="flex items-center gap-1 text-caption font-semibold text-foreground">
          <HomeIcon className="h-3.5 w-3.5" />
          <span className="border-b-2 border-primary pb-0.5">Home</span>
        </span>
        <button
          type="button"
          onClick={show}
          data-testid="progress-stub"
          className="btn-icon-pressed flex items-center gap-1 text-caption text-muted"
        >
          <ProgressIcon className="h-3.5 w-3.5" />
          <span>Progress</span>
        </button>
        <button
          type="button"
          onClick={show}
          data-testid="profile-stub"
          className="btn-icon-pressed flex items-center gap-1 text-caption text-muted"
        >
          <ProfileIcon className="h-3.5 w-3.5" />
          <span>Profile</span>
        </button>
      </nav> : null}

      <ComingSoonToast visible={visible} />
    </div>
  );
}
