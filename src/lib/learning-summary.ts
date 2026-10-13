import { isSupportedLearnerText } from "@/lib/supported-language";

/**
 * The Learning Summary (CONTEXT.md): one Praise, two or three Highlights,
 * one Suggestion and one Closing, in Chinese, written by Claude from
 * everything the learner said across all of their Calls.
 */
export type LearningSummary = {
  praise: string;
  highlights: string[];
  suggestion: string;
  closing: string;
};

export type SummaryLineKind = "praise" | "highlight" | "suggestion" | "closing" | "fallback" | "learner-line";

export type SummaryLine = { id: string; kind: SummaryLineKind; text: string };

/** What the summary route receives: each Call's bubbles, as plain role + text. */
export type SummaryCall = { lines: Array<{ role: "learner" | "emily"; text: string }> };

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Validates a model-produced object into a {@link LearningSummary}, or null if it doesn't have the required shape. */
export function toLearningSummary(value: unknown): LearningSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!nonEmptyString(v.praise) || !nonEmptyString(v.suggestion) || !nonEmptyString(v.closing)) return null;
  if (!Array.isArray(v.highlights)) return null;
  const highlights = v.highlights.filter(nonEmptyString).map((h) => h.trim());
  if (highlights.length < 2) return null;
  return {
    praise: v.praise.trim(),
    highlights: highlights.slice(0, 3),
    suggestion: v.suggestion.trim(),
    closing: v.closing.trim(),
  };
}

/** Pulls a {@link LearningSummary} out of the model's reply, tolerating a Markdown fence or surrounding prose. */
export function parseLearningSummary(text: string): LearningSummary | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return toLearningSummary(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return null;
  }
}

/** The summary in the order it is presented: Praise, Highlights, Suggestion, Closing. */
export function summaryToLines(summary: LearningSummary): SummaryLine[] {
  return [
    { id: "praise", kind: "praise", text: summary.praise },
    ...summary.highlights.map((text, index) => ({ id: `highlight-${index}`, kind: "highlight" as const, text })),
    { id: "suggestion", kind: "suggestion", text: summary.suggestion },
    { id: "closing", kind: "closing", text: summary.closing },
  ];
}

/** Shown when the summary can't be generated: the learner's own English and Chinese lines instead of an error. */
export function fallbackLines(learnerLines: readonly string[]): SummaryLine[] {
  if (learnerLines.length === 0) {
    return [{ id: "fallback", kind: "fallback", text: "这次没有识别到你的发言。下次对话时多说几句吧，我会为你写下学习总结。" }];
  }
  return [
    { id: "fallback", kind: "fallback", text: "学习总结暂时没能生成，先看看你自己说过的话吧：" },
    ...learnerLines.map((text, index) => ({ id: `learner-line-${index}`, kind: "learner-line" as const, text })),
  ];
}

/**
 * The transcript the model reads. Learner lines in unsupported languages are
 * dropped here (and empty lines everywhere), so the model never sees them.
 */
export function buildSummaryTranscript(calls: readonly SummaryCall[]): string {
  return calls
    .map((call, index) => {
      const lines = call.lines
        .filter((l) => (l.role === "learner" ? isSupportedLearnerText(l.text) : l.text.trim() !== ""))
        .map((l) => `${l.role === "learner" ? "Learner" : "Emily"}: ${l.text.trim()}`);
      return lines.length ? `Call ${index + 1}\n${lines.join("\n")}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Validates the summary route's request body. */
export function isSummaryRequest(body: unknown): body is { calls: SummaryCall[] } {
  if (typeof body !== "object" || body === null) return false;
  const calls = (body as { calls?: unknown }).calls;
  return (
    Array.isArray(calls) &&
    calls.length <= 3 &&
    calls.every(
      (call) =>
        typeof call === "object" &&
        call !== null &&
        Array.isArray((call as { lines?: unknown }).lines) &&
        (call as SummaryCall).lines.every(
          (l) =>
            typeof l === "object" &&
            l !== null &&
            (l.role === "learner" || l.role === "emily") &&
            typeof l.text === "string",
        ),
    )
  );
}
