/**
 * Small "👁 Observe / Explore / Notice" pill shown above each of those 3
 * pages' editorial headline (UI draft, 2026-08-06 review). Purely
 * decorative labeling — the page's own <h1> (Observe/Explore/Notice) is
 * still the thing e2e coverage and the outer 5-dot progress header key off.
 */
export function StageTag({ label }: { label: string }) {
  return (
    <span className="flex w-fit items-center gap-1.5 rounded-button bg-accent-soft px-3 py-1 text-body-sm font-medium text-accent">
      <span aria-hidden>👁</span>
      {label}
    </span>
  );
}
