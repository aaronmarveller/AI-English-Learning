import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "样式基准页 — Style Guide",
};

const colors = [
  { token: "primary", label: "主色 / 深蓝", swatch: "bg-primary" },
  { token: "accent", label: "强调色 / 绿", swatch: "bg-accent" },
  { token: "accent-soft", label: "绿色浅底", swatch: "bg-accent-soft" },
  { token: "page", label: "页面背景 / 米白", swatch: "bg-page border border-border" },
  { token: "card", label: "卡片 / 白", swatch: "bg-card border border-border" },
  { token: "foreground", label: "正文文字", swatch: "bg-foreground" },
  { token: "muted", label: "次要文字", swatch: "bg-muted" },
  { token: "border", label: "描边", swatch: "bg-border" },
] as const;

const typeScale = [
  { token: "display", className: "text-display" },
  { token: "h1", className: "text-h1" },
  { token: "h2", className: "text-h2" },
  { token: "h3", className: "text-h3" },
  { token: "body-lg", className: "text-body-lg" },
  { token: "body", className: "text-body" },
  { token: "body-sm", className: "text-body-sm" },
  { token: "caption", className: "text-caption" },
] as const;

const radii = [
  { token: "radius-card", label: "卡片圆角", swatch: "rounded-card" },
  { token: "radius-button", label: "按钮圆角", swatch: "rounded-button" },
] as const;

export default function StyleGuidePage() {
  return (
    <main className="flex flex-col gap-10 px-5 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">样式基准页</h1>
        <p className="text-body text-muted">
          与 UI 设计稿逐项比对配色、字号、圆角 — Style guide
        </p>
      </header>

      <section data-testid="color-palette" className="flex flex-col gap-3">
        <h2 className="text-h3">色板 Color palette</h2>
        <ul className="grid grid-cols-2 gap-3">
          {colors.map((c) => (
            <li key={c.token} className="flex flex-col gap-2">
              <div
                data-token={c.token}
                className={`h-16 rounded-card ${c.swatch}`}
              />
              <span className="text-body-sm">{c.label}</span>
              <span className="text-caption text-muted">--color-{c.token}</span>
            </li>
          ))}
        </ul>
      </section>

      <section data-testid="type-scale" className="flex flex-col gap-4">
        <h2 className="text-h3">字阶 Type scale</h2>
        <ul className="flex flex-col gap-3">
          {typeScale.map((t) => (
            <li key={t.token} data-token={t.token}>
              <p className={t.className}>
                Aa 你好，Emily 早上好 — {t.token}
              </p>
              <span className="text-caption text-muted">--text-{t.token}</span>
            </li>
          ))}
        </ul>
      </section>

      <section data-testid="radii" className="flex flex-col gap-3">
        <h2 className="text-h3">圆角 Radius</h2>
        <ul className="flex gap-6">
          {radii.map((r) => (
            <li key={r.token} className="flex flex-col items-center gap-2">
              <div
                data-token={r.token}
                className={`h-16 w-16 border border-border bg-card ${r.swatch}`}
              />
              <span className="text-caption text-muted">{r.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section data-testid="button-states" className="flex flex-col gap-3">
        <h2 className="text-h3">主按钮三态 Primary button states</h2>
        <ul className="flex flex-wrap gap-4">
          <li className="flex flex-col items-center gap-2">
            <button
              type="button"
              data-state="default"
              className="rounded-button bg-accent px-6 py-3 text-body-lg font-medium text-accent-foreground"
            >
              开始 Start
            </button>
            <span className="text-caption text-muted">常态</span>
          </li>
          <li className="flex flex-col items-center gap-2">
            <button
              type="button"
              data-state="pressed"
              className="scale-[0.98] rounded-button bg-accent px-6 py-3 text-body-lg font-medium text-accent-foreground brightness-90"
            >
              开始 Start
            </button>
            <span className="text-caption text-muted">按下</span>
          </li>
          <li className="flex flex-col items-center gap-2">
            <button
              type="button"
              disabled
              data-state="disabled"
              className="cursor-not-allowed rounded-button bg-accent px-6 py-3 text-body-lg font-medium text-accent-foreground opacity-40"
            >
              开始 Start
            </button>
            <span className="text-caption text-muted">禁用</span>
          </li>
        </ul>
      </section>
    </main>
  );
}
