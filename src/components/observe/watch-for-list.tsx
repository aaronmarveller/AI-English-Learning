import { CONVERSATION_STAGE_LABELS } from "@/content/conversation-stages";
import { OBSERVE_CONTENT } from "@/content/observe";
import type { ActiveConversationState } from "@/lib/conversation-state-machine";

/** Per-stage emoji + icon-circle tint (UI draft, 2026-08-07 review) — same
 * "pastel badge" pattern as Home's Coming Next rows. */
const STAGE_ICON: Record<ActiveConversationState, { emoji: string; bg: string }> = {
  greeting: { emoji: "👋", bg: "bg-amber-100" },
  checkin: { emoji: "😄", bg: "bg-orange-100" },
  response: { emoji: "💬", bg: "bg-violet-100" },
  closing: { emoji: "👋", bg: "bg-yellow-100" },
};

/**
 * Display-only "Watch for" block: the four fixed communication beats to
 * notice in the scene video. No expand/collapse, no click handlers — the
 * acceptance criteria for this block is explicit that it's look-don't-touch
 * (see .scratch/greeting-somebody-mvp/issues/05-observe-page.md).
 *
 * Redesigned as a 2x2 icon-card grid (UI draft, 2026-08-07 review) — the
 * previous numbered-list-with-a-sentence-per-item layout is replaced by one
 * shared intro line ("Notice how they…") plus four glanceable cards.
 */
export function WatchForList() {
  return (
    <section aria-labelledby="watch-for-heading" data-testid="watch-for" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2
          id="watch-for-heading"
          className="flex items-center gap-1.5 text-body-sm font-semibold tracking-wide text-accent uppercase"
        >
          <span aria-hidden>👁</span>
          Watch for
        </h2>
        <p className="text-body text-muted">
          Notice how they… <span>看看他们是怎么…</span>
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-3">
        {OBSERVE_CONTENT.watchFor.map((item) => {
          const label = CONVERSATION_STAGE_LABELS[item.key];
          const icon = STAGE_ICON[item.key];
          return (
            <li
              key={item.key}
              className="flex items-center gap-3 rounded-card border border-border bg-card p-4"
            >
              <span
                aria-hidden
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${icon.bg}`}
              >
                {icon.emoji}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="text-body-lg font-semibold text-foreground">{label.labelEn}</span>
                <span className="text-body-sm text-muted">{label.labelZhLong}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
