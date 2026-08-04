"use client";

import Link from "next/link";
import { useDebugFlag } from "@/lib/debug";
import { STEP_IDS, STEP_LABELS, STEP_ROUTES } from "@/lib/progress";

/**
 * Presenter-only step jump bar: hidden unless debug mode is active (see
 * src/lib/debug.ts for how `?debug=1` activates it). Lets a demoer jump
 * directly to any of the 6 pages, bypassing the progressive-learning guard
 * in src/app/(learning)/layout.tsx (that guard explicitly no-ops when
 * debug mode is on). Rendered on Home (so a demoer can turn debug mode on
 * from the start) and at the top of the learning layout.
 */
export function DebugJumpBar() {
  const active = useDebugFlag();

  if (!active) return null;

  const linkClassName =
    "rounded-button bg-card px-3 py-1 text-caption text-foreground shadow-sm active:scale-95 active:brightness-90";

  return (
    <nav
      aria-label="调试跳转 Debug jump bar"
      data-testid="debug-jump-bar"
      className="flex flex-wrap items-center gap-2 border-b border-border bg-accent-soft px-4 py-2"
    >
      <span className="text-caption font-semibold text-muted">DEBUG</span>
      <Link href="/" className={linkClassName}>
        Home
      </Link>
      {STEP_IDS.map((step) => (
        <Link key={step} href={`${STEP_ROUTES[step]}?debug=1`} className={linkClassName}>
          {STEP_LABELS[step]}
        </Link>
      ))}
    </nav>
  );
}
