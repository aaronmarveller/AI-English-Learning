"use client";

import { ChevronDownIcon, LightbulbIcon } from "@/components/icons";
import { NoticeIcon } from "@/components/notice/notice-icon";
import type { NoticeCard as NoticeCardContent, NoticeSide } from "@/content/notice";

type NoticeCardProps = {
  /** 1-based position, rendered in the leading numbered circle. */
  index: number;
  card: NoticeCardContent;
  open: boolean;
  onToggle: () => void;
};

type Tone = "left" | "right";

const TONE = {
  left: {
    panel: "bg-accent-soft",
    title: "text-accent",
    badge: "bg-accent-soft text-accent",
    tile: "bg-white text-accent",
  },
  right: {
    panel: "bg-[#fdecea]",
    title: "text-[#9b2c2c]",
    badge: "bg-[#fdecea] text-danger",
    tile: "bg-white text-danger",
  },
} as const;

function PhotoCircle({ side, tone }: { side: NoticeSide; tone: Tone }) {
  return (
    <span className="relative block h-[74px] w-[74px] shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- placeholder photos; a missing file must show an empty circle, not a broken layout. */}
      <img
        src={side.photo.src}
        alt={side.photo.alt}
        className="h-full w-full rounded-full bg-page object-cover"
      />
      <span
        aria-hidden
        className={`absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white ${TONE[tone].badge}`}
      >
        <NoticeIcon name={side.icon} className="h-3.5 w-3.5" />
      </span>
    </span>
  );
}

function SidePanel({
  side,
  tone,
  cardId,
}: {
  side: NoticeSide;
  tone: Tone;
  cardId: NoticeCardContent["id"];
}) {
  const t = TONE[tone];
  const showBigIcon = cardId === "greeting-intention";
  const hasCues = cardId === "conversation-cues";

  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-2 rounded-card p-3 ${t.panel}`}>
      {showBigIcon ? <NoticeIcon name={side.icon} className={`h-9 w-9 ${t.title}`} /> : null}
      <div className="flex flex-col">
        <span className={`text-body font-semibold ${t.title}`}>{side.titleEn}</span>
        <span className={`text-body-sm ${t.title}`}>{side.titleZh}</span>
      </div>
      {showBigIcon || hasCues ? <hr className="border-0 border-t border-black/10" /> : null}
      {side.description ? <p className="text-body-sm text-foreground">{side.description}</p> : null}
      {side.items && !hasCues ? (
        <ul className="grid grid-cols-3 gap-1">
          {side.items.map((item) => (
            <li
              key={item.label}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 ${t.tile}`}
            >
              <NoticeIcon name={item.icon} className="h-5 w-5" />
              <span className="text-caption text-foreground">{item.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {side.items && hasCues ? (
        <ul className="flex flex-col gap-2">
          {side.items.map((item) => (
            <li key={item.label} className="flex items-center gap-2">
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${t.tile}`}
              >
                <NoticeIcon name={item.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0 text-body-sm text-foreground">{item.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * One Notice Card: a numbered header showing the card's question and, while
 * collapsed, two circular photos around "VS"; expanded, a two-panel contrast
 * (green left / pink right) and a tip bar. `open` and `onToggle` come from
 * NoticePageContent, which keeps per-card state so any number of cards can
 * be open at once.
 *
 * Keeps the `{id}`, `{id}-header` (aria-expanded/aria-controls) and
 * `{id}-body` testids plus `data-state="expanded"|"collapsed"`.
 */
export function NoticeCard({ index, card, open, onToggle }: NoticeCardProps) {
  const testId = card.id;
  const bodyId = `${testId}-body`;

  return (
    <section
      data-testid={testId}
      data-state={open ? "expanded" : "collapsed"}
      className="rounded-card border border-border bg-card"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        data-testid={`${testId}-header`}
        className="flex w-full items-start gap-3 px-4 py-4 text-left active:brightness-95"
        onClick={onToggle}
      >
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-caption font-semibold text-accent"
        >
          {index}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-3">
          <span className="text-h3 text-foreground">{card.question}</span>
          {!open ? (
            <span aria-hidden className="flex w-full items-center justify-center gap-3">
              <PhotoCircle side={card.left} tone="left" />
              <span className="flex items-center gap-2 text-caption text-muted">
                <span className="h-8 w-px bg-border" />
                VS
                <span className="h-8 w-px bg-border" />
              </span>
              <PhotoCircle side={card.right} tone="right" />
            </span>
          ) : null}
        </span>

        <span aria-hidden className="shrink-0 text-accent">
          <ChevronDownIcon
            className={`h-5 w-5 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open ? (
        <div id={bodyId} data-testid={bodyId} className="flex min-w-0 flex-col gap-3 px-4 pb-4">
          <div className="flex items-stretch gap-2">
            <SidePanel side={card.left} tone="left" cardId={card.id} />
            <span aria-hidden className="flex shrink-0 items-center text-caption text-muted">
              VS
            </span>
            <SidePanel side={card.right} tone="right" cardId={card.id} />
          </div>
          <p className="flex items-start gap-2 rounded-card bg-accent-soft px-3 py-3 text-body-sm text-foreground">
            <LightbulbIcon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <span>{card.tip}</span>
          </p>
        </div>
      ) : null}
    </section>
  );
}
