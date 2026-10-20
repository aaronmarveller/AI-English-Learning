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

export function WaveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11 10.5V5a1.5 1.5 0 0 1 3 0v6" />
      <path d="M14 8a1.5 1.5 0 0 1 3 0v6.5a6 6 0 0 1-6 6h-.5a5 5 0 0 1-4-2L4 15.5a1.5 1.5 0 0 1 2.4-1.8L8 15.5V12" />
      <path d="M3 6.5C3.6 4.5 5 3.3 7 3" />
    </IconBase>
  );
}

export function HeartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
    </IconBase>
  );
}

export function CoffeeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9Z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 3.5v2M12 3.5v2" />
    </IconBase>
  );
}

export function ForkKnifeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M7 3v7a2 2 0 0 0 2 2v9" />
      <path d="M5 3v7M9 3v7" />
      <path d="M17 21V3c-2.2 1.5-3 4-3 7 0 1.7.9 2.5 3 2.5" />
    </IconBase>
  );
}

export function ShoppingBagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </IconBase>
  );
}

export function BriefcaseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5" />
      <path d="M3.5 13h17" />
    </IconBase>
  );
}

export function HouseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-4.5h4V19" />
    </IconBase>
  );
}

export function UsersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2" />
      <path d="M17 14.3c2.3.5 4 2.3 4 5.2" />
    </IconBase>
  );
}

export function ChatBubbleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16h-8l-4.5 3.5V16H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 5Z" />
    </IconBase>
  );
}

export function UserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </IconBase>
  );
}

export function ExitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M10 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H10" />
      <path d="M14 8l4 4-4 4" />
      <path d="M18 12H9" />
    </IconBase>
  );
}

export function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </IconBase>
  );
}

export function LightbulbIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M9 17.5h6M10 20.5h4" />
      <path d="M12 3.5a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17.5h5.2v-1.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3.5Z" />
    </IconBase>
  );
}

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="m6 9.5 6 6 6-6" />
    </IconBase>
  );
}
