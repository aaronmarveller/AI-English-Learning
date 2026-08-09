"use client";

import { useState, type ReactNode } from "react";
import { ComingSoonDialog } from "@/components/coming-soon-dialog";

export function TopNav({ left, showStubNav = true }: { left: ReactNode; showStubNav?: boolean }) {
  const [showComingSoon, setShowComingSoon] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">{left}</div>
        {showStubNav ? (
          <nav aria-label="主导航 Main navigation" className="flex shrink-0 items-center gap-4">
            <span className="flex items-center gap-1 text-body-sm font-semibold text-foreground">
              <span aria-hidden>🏠</span>
              <span className="border-b-2 border-primary pb-0.5">Home</span>
            </span>
            <button
              type="button"
              data-testid="progress-stub"
              className="btn-icon-pressed flex items-center gap-1 text-body-sm text-muted"
              onClick={() => setShowComingSoon(true)}
            >
              <span aria-hidden>📊</span>
              <span>Progress</span>
            </button>
            <button
              type="button"
              data-testid="profile-stub"
              className="btn-icon-pressed flex items-center gap-1 text-body-sm text-muted"
              onClick={() => setShowComingSoon(true)}
            >
              <span aria-hidden>👤</span>
              <span>Profile</span>
            </button>
          </nav>
        ) : null}
      </div>
      {showComingSoon ? <ComingSoonDialog onClose={() => setShowComingSoon(false)} /> : null}
    </>
  );
}
