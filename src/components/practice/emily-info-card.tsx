/**
 * Emily's persona card, overlaid top-right on the Practice hero photo
 * (2026-08-07 UI draft): name + US flag, her "AI Conversation Partner" role
 * (spec.md's own term for her — see .scratch/greeting-somebody-mvp/spec.md
 * "设计理念"), and a location line. Purely decorative flavor copy — nothing
 * here is read by any other module or asserted by e2e coverage.
 *
 * Reuses the flag PNG at /assets/notice/flag-us.png directly rather than
 * importing notice's FlagIcon component — same reason that asset exists at
 * all (src/components/notice/flag-icon.tsx's doc comment): Windows has no
 * flag glyphs in its default emoji font, so a real image is needed here too.
 */
export function EmilyInfoCard() {
  return (
    <div className="flex flex-col gap-0.5 rounded-[10px] bg-card/95 px-2 py-1.5 shadow-sm backdrop-blur-sm">
      <span className="flex items-center gap-1 text-body-sm font-semibold text-foreground">
        Emily
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny decorative icon; next/image's layout machinery buys nothing here. */}
        <img src="/assets/notice/flag-us.png" alt="" aria-hidden className="h-2.5 w-auto rounded-[2px]" />
      </span>
      <span className="text-[10px] leading-snug text-muted">AI Conversation Partner</span>
      <span className="flex items-center gap-1 text-[10px] leading-snug text-muted">
        <span aria-hidden>📍</span> Seattle, USA
      </span>
    </div>
  );
}
