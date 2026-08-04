"use client";

export type EmilyAvatarState = "idle" | "talking" | "thinking";

type EmilyAvatarProps = {
  state: EmilyAvatarState;
};

const STATE_LABEL: Record<EmilyAvatarState, string> = {
  idle: "Emily 待机中 Idle",
  talking: "Emily 正在说话 Talking",
  thinking: "Emily 正在思考 Thinking",
};

/**
 * Emily's avatar, in her 3 states (ticket 08; spec.md "Practice 页交互模型").
 * No illustration asset exists yet (spec.md "Further Notes" > 待用户提供的
 * 交付依赖 lists Emily 立绘 as still-pending) — this renders a placeholder
 * circle with an initial, sized/positioned as the real illustration would
 * be, so the 3-state behavior can ship without blocking on art.
 *
 * The 3 states are pure CSS, driven by `data-state` (see the
 * `.emily-avatar[data-state=...]` rules in globals.css): idle is a slow
 * breathing scale, talking is a subtle float + glow-ring pulse, thinking is
 * reduced opacity + a 3-dot "typing indicator" rendered below. No lip sync
 * (spec.md explicitly excludes it). `prefers-reduced-motion: reduce` drops
 * every animation in globals.css, keeping only each state's static
 * difference (thinking's dimmed opacity, the dots' static presence).
 */
export function EmilyAvatar({ state }: EmilyAvatarProps) {
  return (
    <div className="flex flex-col items-center gap-2" data-testid="emily-avatar-wrapper">
      <div
        data-testid="emily-avatar"
        data-state={state}
        aria-hidden
        className="emily-avatar flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <span className="text-display">E</span>
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
