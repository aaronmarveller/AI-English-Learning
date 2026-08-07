/**
 * Small "👁 Observe / Explore / Notice / 🎙 Practice / ✨ Review" label shown
 * above each learning page's editorial headline (UI draft, 2026-08-06
 * review). Purely decorative labeling by default — the page's own <h1> is
 * the thing e2e coverage and the outer 5-dot progress header key off.
 *
 * Bold green text only, no pill background (UI draft, 2026-08-07 review
 * round 4: the earlier `bg-accent-soft` chip treatment was wrong — just
 * bold, colored text).
 *
 * `asHeading`: Observe's page previously repeated its own name right below
 * this pill ("👁 Observe" pill, then a literal "Observe" <h1>) — visually a
 * duplicate (UI draft, 2026-08-07 review flagged it). Passing `asHeading`
 * makes this pill itself the page's accessible h1 (via `role="heading"
 * aria-level={1}`, not a literal `<h1>` — this component is reused inline
 * next to other text, and a real `<h1>` there would be a layout/semantics
 * mismatch) so the redundant text can be deleted without losing the
 * `getByRole("heading", { name: "Observe" })` a11y contract e2e/observe.spec.ts
 * relies on. Off by default: Notice/Explore/Practice/Review still pair this
 * pill with their own separate `<h1>`.
 */
export function StageTag({
  label,
  icon = "👁",
  asHeading = false,
}: {
  label: string;
  icon?: string;
  asHeading?: boolean;
}) {
  return (
    <span
      role={asHeading ? "heading" : undefined}
      aria-level={asHeading ? 1 : undefined}
      className="flex w-fit items-center gap-1.5 text-body-sm font-bold text-accent"
    >
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}
