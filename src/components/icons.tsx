import type { SVGProps } from "react";

/**
 * Small line-icon set for persistent chrome (TopNav's Home,
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

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.8 2.8L16 9.5" />
    </IconBase>
  );
}

export function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </IconBase>
  );
}

export function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </IconBase>
  );
}
