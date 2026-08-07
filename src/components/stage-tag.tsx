/**
 * Small "👁 Observe / Explore / Notice / 🎙 Practice / ✨ Review" pill shown
 * above each learning page's editorial headline (UI draft, 2026-08-06
 * review). Purely decorative labeling — the page's own <h1> is still the
 * thing e2e coverage and the outer 5-dot progress header key off.
 */
export function StageTag({ label, icon = "👁" }: { label: string; icon?: string }) {
  return (
    <span className="flex w-fit items-center gap-1.5 rounded-button bg-accent-soft px-3 py-1 text-body-sm font-medium text-accent">
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}
