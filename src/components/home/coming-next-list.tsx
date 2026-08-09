"use client";

import { ComingSoonToast, useComingSoonToast } from "@/components/coming-soon-toast";
import { HOME_CONTENT } from "@/content/home";

/**
 * "Coming Next" — 4 locked future lessons (spec.md user stories 16–17).
 * Tapping a row has nowhere to navigate to (none of these lessons exist
 * yet), so each row is a <button> that surfaces the shared "正在制作中"
 * toast instead. The lock icon (in its own subdued circle, UI draft
 * 2026-08-07 review) + absence of any `active:` press styling (contrast
 * this with MissionCard/StartLessonButton, which both have `active:`
 * feedback) is still the visual signal that these rows read as locked, even
 * though they're clickable now. Each row carries its own pastel tint
 * (item.tint, src/content/home.ts) instead of the flat opacity-faded white
 * card the previous design used.
 */
export function ComingNextList() {
  const { visible, show } = useComingSoonToast();

  return (
    <section aria-labelledby="coming-next-heading" className="flex flex-col gap-3">
      <h2 id="coming-next-heading" className="text-h3">
        Coming Next
      </h2>

      <ul className="flex flex-col gap-2">
        {HOME_CONTENT.comingNext.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={show}
              data-testid={`coming-next-${item.id}`}
              className={`flex w-full items-center gap-3 rounded-card px-4 py-3 text-left ${item.tint.row}`}
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
            </button>
          </li>
        ))}
      </ul>

      <p className="text-center text-body-sm text-muted">{HOME_CONTENT.comingNextFooter}</p>

      <ComingSoonToast visible={visible} />
    </section>
  );
}
