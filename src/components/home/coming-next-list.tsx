import { HOME_CONTENT } from "@/content/home";

/**
 * "Coming Next" — 4 locked future lessons (spec.md user stories 16–17).
 * Every row is a plain <div> with no onClick/href at all: there's nothing
 * to bind navigation to, so "clicking does nothing" holds by construction
 * rather than by an onClick that calls preventDefault. `aria-disabled`
 * documents the locked state for assistive tech; the lock emoji + reduced
 * opacity + absence of any `active:` press styling (contrast this with
 * MissionCard/StartLessonButton, which both have `active:` feedback) is the
 * visual signal that these rows — unlike everything else on this page — are
 * not interactive.
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
              className="flex cursor-default items-center gap-3 rounded-card border border-border bg-card px-4 py-3 opacity-50"
            >
              <span aria-hidden className="text-h3">
                {item.icon}
              </span>
              <div className="flex flex-1 flex-col">
                <span className="text-body font-medium text-foreground">{item.nameEn}</span>
                <span className="text-body-sm text-muted">{item.nameZh}</span>
              </div>
              <span aria-hidden className="text-body-sm text-muted">
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
