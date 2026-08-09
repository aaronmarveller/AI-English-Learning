"use client";

import type { ReactNode } from "react";

export type EmilyAvatarState = "idle" | "talking" | "thinking";

type EmilyAvatarProps = {
  state: EmilyAvatarState;
  /** Rendered absolutely over the top-right corner of the photo frame — the EmilyInfoCard. */
  topOverlay?: ReactNode;
  /** Rendered absolutely over the photo's upper-left column, clear of Emily's own right-anchored figure — the page headline. */
  headlineOverlay?: ReactNode;
  /** Rendered absolutely over the bottom of the photo frame — Emily's current-line bubble. */
  bottomOverlay?: ReactNode;
};

const STATE_LABEL: Record<EmilyAvatarState, string> = {
  idle: "Emily 待机中 Idle",
  talking: "Emily 正在说话 Talking",
  thinking: "Emily 正在思考 Thinking",
};

/**
 * Emily's avatar, in her 3 states (ticket 08; spec.md "Practice 页交互模型").
 * public/assets/emily/{room-big,emily-practice}.png (added after ticket 08
 * shipped — see the 2026-08-06 UI draft review) are the real illustration:
 * a living-room backdrop with Emily's cutout composited over it, matching
 * the UI draft's Practice screen. Room-scale photography, not a small
 * circular icon, is why this no longer renders as a fixed h-24 w-24 circle.
 *
 * The 3 states are pure CSS, driven by `data-state` (see the
 * `.emily-avatar[data-state=...]` rules in globals.css): idle is a slow
 * breathing scale, talking is a subtle float + glow-ring pulse, thinking is
 * reduced opacity + a 3-dot "typing indicator" rendered below. No lip sync
 * (spec.md explicitly excludes it). `prefers-reduced-motion: reduce` drops
 * every animation in globals.css, keeping only each state's static
 * difference (thinking's dimmed opacity, the dots' static presence).
 */
export function EmilyAvatar({ state, topOverlay, headlineOverlay, bottomOverlay }: EmilyAvatarProps) {
  return (
    <div className="flex w-full flex-col items-center gap-2" data-testid="emily-avatar-wrapper">
      <div
        className="relative w-full overflow-hidden rounded-card bg-primary"
        style={{ aspectRatio: "1 / 1" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-aspect
            decorative composite; next/image's layout machinery buys nothing here. */}
        <img
          src="/assets/emily/room-big.png"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          data-testid="emily-avatar"
          data-state={state}
          aria-hidden
          className="emily-avatar absolute inset-0 flex items-end justify-end"
        >
          {/*
            `max-h-[72%]` is a percentage max-height, which only resolves
            against an ancestor with a *definite* height. The old wrapper
            used `inset-x-0 bottom-0` with no `top` — an absolutely
            positioned box with `height: auto` sizes itself *from* its
            content, so from this img's point of view its containing block's
            height is 'auto', and per the CSS spec a percentage height
            against an 'auto' containing block resolves to 'auto' too. The
            browser then fell back to the image's intrinsic 1254x1254 size,
            rendering Emily ~5x taller than her frame and pushing almost all
            of her outside the visible, clipped composite (see
            e2e/practice-emily-photo.spec.ts). `inset-0` gives this wrapper a
            definite height (100% of the room photo's own definite
            aspect-ratio height), which `max-h-[72%]` can resolve against;
            `items-end` keeps her feet aligned to the frame's bottom the same
            way `bottom-0` was meant to.

            emily-practice.png is an exact square (1254x1254) and the frame
            above is also a square (`1 / 1`), so *any* height% here also
            renders her at that same %-of-width — she can never overflow the
            frame regardless of the value chosen. 78% (2026-08-08 — bumped
            again from 75%) keeps her fully inside the frame; the headline
            overlay's lower-left corner (its least essential line — the
            descriptive body copy) sits over the top-left corner of her
            square crop, which the overlap-fraction math below keeps inside
            the region that's checked (not assumed) to be empty transparent
            margin above her raised hand: her fingertips are the first opaque
            pixels reaching this far left, at roughly 14% of the crop's width
            / 35% of its height. Don't push this past ~78-80% without
            re-checking against public/assets/emily/emily-practice.png — the
            overlap fraction climbs with every % and eventually reaches her
            actual fingers, not empty space.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
          <img
            src="/assets/emily/emily-practice.png"
            alt=""
            className="max-h-[78%] object-contain"
          />
        </div>

        {/*
          `top-3` keeps this above Emily's actual head (not just the frame's
          top edge): at her 78% sizing below, her hairline sits ~19px under
          this card's bottom edge — a bigger Emily than that needs this
          checked again too, same as the headline column's overlap comment.
        */}
        {topOverlay ? <div className="absolute right-3 top-3">{topOverlay}</div> : null}
        {/*
          `right-[65%]` (rather than a max-width on the headline's own
          content) gives this wrapper a *definite* width — left and right
          together pin it, instead of leaving it to shrink-to-fit around
          content that itself only has a percentage max-width (which
          resolves unreliably against a shrink-to-fit auto-width ancestor).
          The headline column sits left of the EmilyInfoCard (right-anchored)
          and mostly left of Emily's own photo (right-anchored, 78% sizing
          above — see that comment for the one corner where they do overlap,
          deliberately, on empty transparent pixels). This value and Emily's
          size move together, not independently — a bigger Emily needs a
          narrower headline column to keep that same corner overlap safe.
        */}
        {headlineOverlay ? <div className="absolute left-3 right-[65%] top-[4%]">{headlineOverlay}</div> : null}
        {bottomOverlay ? <div className="absolute inset-x-3 bottom-3">{bottomOverlay}</div> : null}
      </div>

      <div
        data-testid="emily-thinking-indicator"
        aria-hidden
        className={`flex h-2 items-center gap-1 ${state === "thinking" ? "" : "invisible"}`}
      >
        <span className="emily-thinking-dot h-1.5 w-1.5 rounded-full bg-muted" />
        <span className="emily-thinking-dot h-1.5 w-1.5 rounded-full bg-muted" />
        <span className="emily-thinking-dot h-1.5 w-1.5 rounded-full bg-muted" />
      </div>

      {/* Sound wave — spec.md "Practice 页交互模型": "Talking 为轻微浮动 + 声波
          + 发光环脉冲" names 3 talking-state cues; float + glow-pulse live on
          .emily-avatar itself via globals.css, this bar trio is the 3rd. */}
      <div
        data-testid="emily-sound-wave"
        aria-hidden
        className={`flex h-3 items-end gap-1 ${state === "talking" ? "" : "invisible"}`}
      >
        <span className="emily-sound-bar w-1 rounded-full bg-accent" />
        <span className="emily-sound-bar w-1 rounded-full bg-accent" />
        <span className="emily-sound-bar w-1 rounded-full bg-accent" />
      </div>

      <span className="sr-only" role="status">
        {STATE_LABEL[state]}
      </span>
    </div>
  );
}
