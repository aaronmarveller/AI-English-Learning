/**
 * Top-of-page Progress/Profile placeholders (spec.md user story: "顶部的
 * Progress 与 Profile 仅作占位，点击不产生导航"; also spec.md Out of Scope:
 * neither page exists in this MVP). Rendered as `aria-hidden` spans with no
 * click handler at all — not buttons/links — so there is nothing to bind
 * navigation to and nothing for a screen reader to announce as an
 * interactive control that leads nowhere.
 */
export function HomeTopBar() {
  return (
    <div className="flex items-center justify-between">
      <span
        aria-hidden
        data-testid="progress-stub"
        className="flex h-9 w-9 items-center justify-center rounded-button text-h3 text-muted"
      >
        📊
      </span>
      <span
        aria-hidden
        data-testid="profile-stub"
        className="flex h-9 w-9 items-center justify-center rounded-button text-h3 text-muted"
      >
        👤
      </span>
    </div>
  );
}
