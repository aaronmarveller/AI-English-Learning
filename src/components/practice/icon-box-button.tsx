"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconBoxButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  /** Primary (bold) label line. */
  lineOne: ReactNode;
  /** Secondary (muted) label line, rendered below `lineOne`. */
  lineTwo: ReactNode;
};

/**
 * Small bordered icon-on-top-of-two-line-label button (2026-08-07 UI draft):
 * the "Type instead" / "Ask in Chinese" pair flanking Practice's mic button.
 * Purely presentational — every behavioral prop (onClick, disabled,
 * data-testid, aria-label, ...) passes straight through to the underlying
 * `<button>`, so call sites keep full control over their own testid/a11y
 * contract; this component only owns the shared visual shape.
 */
export function IconBoxButton({ icon, lineOne, lineTwo, className = "", ...buttonProps }: IconBoxButtonProps) {
  return (
    <button
      type="button"
      className={`btn-icon-pressed flex w-20 shrink-0 flex-col items-center gap-0.5 rounded-card border border-border bg-card px-2 py-3 text-center disabled:cursor-not-allowed disabled:opacity-40 ${className}`.trim()}
      {...buttonProps}
    >
      <span aria-hidden className="text-h3">
        {icon}
      </span>
      <span className="text-caption font-medium text-foreground">{lineOne}</span>
      <span className="text-caption text-muted">{lineTwo}</span>
    </button>
  );
}
