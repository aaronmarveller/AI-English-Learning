type FlagIconProps = {
  className?: string;
};

/**
 * Small flag icons for the US/China comparison columns, backed by real
 * image files rather than Unicode flag emoji (🇺🇸/🇨🇳) or a hand-drawn SVG —
 * Windows has no flag glyphs in its default emoji font (renders bare
 * "US"/"CN" text instead of a flag; confirmed via live QA, 2026-08-07),
 * and a supplied icon reads more correct than an approximated one. Files
 * aren't in the repo yet; drop them at these paths once available.
 */
export function UsFlagIcon({ className }: FlagIconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny decorative icon; next/image's layout machinery buys nothing here.
    <img src="/assets/notice/flag-us.png" alt="" aria-hidden className={className} />
  );
}

export function ChinaFlagIcon({ className }: FlagIconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see above
    <img src="/assets/notice/flag-china.png" alt="" aria-hidden className={className} />
  );
}
