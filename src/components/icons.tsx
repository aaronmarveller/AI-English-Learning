import type { SVGProps } from "react";

/**
 * Small line-icon set for persistent chrome (TopNav's Home/Progress/Profile,
 * Observe's location line) — UI draft, 2026-08-07 review feedback: the emoji
 * stand-ins used here (🏠📊👤📍) don't read as "colored" the way the draft's
 * icons do, because several of them (👤 "bust in silhouette" especially) are
 * flat monochrome glyphs by Unicode design, not stylized colorful icons.
 * `stroke="currentColor"` makes these inherit whatever text color/weight
 * their surrounding span already carries (e.g. TopNav's active-vs-muted
 * distinction), so no separate active/inactive icon variant is needed.
 *
 * Emoji remain the right call elsewhere in this app (course category icons,
 * Watch For's stage icons, Coming Next's lesson icons — see src/content/*.ts)
 * per spec.md's Further Notes: those are one-off decorative stand-ins for
 * pending image assets. This set is different — persistent navigation/
 * location chrome that needs to render identically regardless of the OS's
 * emoji font.
 */

function IconBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    />
  );
}

export function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
      <path d="M10 20v-5h4v5" />
    </IconBase>
  );
}

export function ProgressIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M5 20V13" />
      <path d="M12 20V6" />
      <path d="M19 20v-8" />
    </IconBase>
  );
}

export function ProfileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
    </IconBase>
  );
}

export function PinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 21s7-6.1 7-11.5a7 7 0 1 0-14 0C5 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.25" />
    </IconBase>
  );
}
