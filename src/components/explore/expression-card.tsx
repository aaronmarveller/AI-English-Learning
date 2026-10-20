import { PronunciationButton } from "@/components/explore/pronunciation-button";

export type ExpressionTint = "green" | "blue" | "yellow";

export const TINT_CYCLE: ExpressionTint[] = ["green", "blue", "yellow"];

const TINT_CLASSES: Record<ExpressionTint, string> = {
  green: "bg-accent-soft",
  blue: "bg-[#e8f0fb]",
  yellow: "bg-[#fdf3d6]",
};

type ExpressionCardProps = {
  id: string;
  /** Spoken lines; each gets its own pronunciation button. */
  lines: string[];
  zh: string;
  /** Pill text: the Chinese tag, or "<Role> · <中文>" in Response & Keep It Going. */
  pill: string;
  tint: ExpressionTint;
};

/**
 * One text expression card: bold English line(s) each with its own audio
 * button, then one shared Chinese translation and a small pill.
 */
export function ExpressionCard({ id, lines, zh, pill, tint }: ExpressionCardProps) {
  return (
    <div
      data-testid={`expression-card-${id}`}
      data-tint={tint}
      className={`flex flex-col gap-1 rounded-card p-4 ${TINT_CLASSES[tint]}`}
    >
      {lines.map((line, index) => (
        <div key={line} className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-h3 font-semibold text-foreground">{line}</p>
          <PronunciationButton
            text={line}
            testId={lines.length > 1 ? `pronounce-${id}-${index + 1}` : `pronounce-${id}`}
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-body-sm text-muted">{zh}</p>
        <span className="w-fit rounded-button bg-white/70 px-2 py-1 text-caption text-foreground">
          {pill}
        </span>
      </div>
    </div>
  );
}
