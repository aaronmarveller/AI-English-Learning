import { HOME_CONTENT } from "@/content/home";

/**
 * "Coming Next" — 4 locked future lessons (spec.md user stories 16–17).
 * Every row is a plain <div> with no onClick/href at all: there's nothing
 * to bind navigation to, so "clicking does nothing" holds by construction
 * rather than by an onClick that calls preventDefault. `aria-disabled`
 * documents the locked state for assistive tech; the lock icon (now in its
 * own subdued circle, UI draft 2026-08-07 review) + absence of any
 * `active:` press styling (contrast this with MissionCard/StartLessonButton,
 * which both have `active:` feedback) is the visual signal that these rows
 * — unlike everything else on this page — are not interactive. Each row
 * carries its own pastel tint (item.tint, src/content/home.ts) instead of
 * the flat opacity-faded white card the previous design used.
 */
export function ComingNextList() {
  return (
    <section aria-labelledby="coming-next-heading" className="flex flex-col gap-3">
      <h2 id="coming-next-heading" className="text-h3">
        Coming Next
      </h2>

      <ul className="flex flex-col gap-2">
        {HOME_CONTENT.comingNext.map((item) => (
          <li key={item.id}>
            <div
              aria-disabled="true"
              data-testid={`coming-next-${item.id}`}
              className={`flex cursor-default items-center gap-3 rounded-card px-4 py-3 ${item.tint.row}`}
            >
              <span
                aria-hidden
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-h3 ${item.tint.badge}`}
              >
                {item.icon}
              </span>
              <div className="flex flex-1 flex-col">
                <span className="text-body font-medium text-foreground">{item.nameEn}</span>
                <span className="text-body-sm text-muted">{item.nameZh}</span>
              </div>
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/60 text-body-sm text-muted"
              >
                🔒
              </span>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-center text-body-sm text-muted">{HOME_CONTENT.comingNextFooter}</p>
    </section>
  );
}
