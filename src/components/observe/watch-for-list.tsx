import { CONVERSATION_STAGE_LABELS } from "@/content/conversation-stages";
import { OBSERVE_CONTENT } from "@/content/observe";

/**
 * Display-only "Watch for" block: the four fixed communication beats to
 * notice in the scene video. No expand/collapse, no click handlers — the
 * acceptance criteria for this block is explicit that it's look-don't-touch
 * (see .scratch/greeting-somebody-mvp/issues/05-observe-page.md).
 */
export function WatchForList() {
  return (
    <section
      aria-labelledby="watch-for-heading"
      data-testid="watch-for"
      className="rounded-card border border-border bg-card p-5"
    >
      <h2 id="watch-for-heading" className="text-h3">
        Watch for
      </h2>
      <ul className="mt-4 flex flex-col gap-4">
        {OBSERVE_CONTENT.watchFor.map((item, index) => {
          const label = CONVERSATION_STAGE_LABELS[item.key];
          return (
            <li key={item.key} className="flex gap-3">
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-body-sm font-medium text-accent"
              >
                {index + 1}
              </span>
              <div>
                <p className="text-body-lg font-medium text-foreground">
                  {label.labelZhLong} <span className="text-muted">· {label.labelEn}</span>
                </p>
                <p className="text-body text-muted">{item.description}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
