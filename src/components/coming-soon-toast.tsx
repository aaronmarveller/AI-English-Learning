"use client";

/**
 * Shared "正在制作中" toast for stub entry points that have no destination
 * yet (TopNav's Progress/Profile, Home's locked Coming Next rows). A brief
 * bottom banner rather than navigating to /coming-soon (used by Review's
 * "继续下一课") — these are persistent chrome / a list of 4 rows a learner
 * might tap several times, so staying on the page beats a full transition.
 */

import { useCallback, useEffect, useState } from "react";

const AUTO_DISMISS_MS = 2200;

export function useComingSoonToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  const show = useCallback(() => setVisible(true), []);

  return { visible, show };
}

export function ComingSoonToast({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div
      aria-live="polite"
      role="status"
      data-testid="coming-soon-toast"
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-5"
    >
      <div className="toast-enter w-full max-w-[380px] rounded-button bg-foreground px-4 py-2.5 text-center text-body-sm font-medium text-card shadow-sm">
        正在制作中，Coming Soon
      </div>
    </div>
  );
}
