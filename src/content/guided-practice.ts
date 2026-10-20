/**
 * Guided Practice content — two Situations (see CONTEXT.md "Situation"), the
 * three Response & Keep It Going expressions the learner assembles a reply
 * from, and the rule-based feedback for every Situation × selection.
 *
 * Single data source: components only consume this, never hardcode copy.
 * Every string is taken word for word from the Guided Practice Feedback
 * Matrix (V4) attached to the Page 5 ticket.
 */
import { EXPLORE_SECTIONS, type FormulaRole, type RoleExpression } from "@/content/explore";

export const GUIDED_PRACTICE_HEADLINE = "Build your response.";

export const GUIDED_PRACTICE_STEPS = {
  situation: { title: "先选择一个场景", subtitle: "不同的场景，适合的表达可能不同。" },
  expressions: { title: "再选择一句或多句，组成你的回答" },
};

export const YOUR_RESPONSE_EMPTY = "还没有选择内容，请先选择场景并勾选你想说的句子。";

/** The three core expressions, reused from Explore — one per Conversation Formula role, in formula order. */
export const CORE_EXPRESSIONS: readonly RoleExpression[] = EXPLORE_SECTIONS.response.main;

/**
 * A selection, keyed by which roles are ticked, in formula order:
 * "r" Respond, "a" Add More, "b" Ask Back (the matrix's own R / A / B ids).
 */
export type SelectionKey = "r" | "a" | "b" | "ra" | "rb" | "ab" | "rab";

const ROLE_LETTER: Record<FormulaRole, string> = { respond: "r", "add-more": "a", "ask-back": "b" };

export type Feedback = { en: string; zh: string };

export type SituationId = "coffee-shop" | "neighbor";

export type Situation = {
  id: SituationId;
  name: string;
  icon: string;
  image: string;
  imageAlt: string;
  /** The other person's opening line, spoken by the greeting audio. */
  greeting: string;
  feedback: Record<SelectionKey, Feedback>;
};

export const SITUATIONS: readonly Situation[] = [
  {
    id: "coffee-shop",
    name: "Coffee Shop",
    icon: "☕",
    image: "/assets/guided-practice/coffee-shop.webp",
    imageAlt: "咖啡店店员微笑着把咖啡递给顾客",
    greeting: "Hi! How are you?",
    feedback: {
      r: { en: "Nice and simple!", zh: "在咖啡店快速打招呼时，简短回应通常就足够了。" },
      a: { en: "Good start!", zh: "分享近况也可以，不过在快速打招呼时，通常先简单回应就够了。" },
      b: { en: "Friendly choice!", zh: "回问对方很友好，不过通常可以先简单回应一句。" },
      ra: { en: "Sounds natural!", zh: "如果你想分享一点近况，这样回应也很自然；简短回应通常就够了。" },
      rb: { en: "Nice choice!", zh: "你友好地回应并回问。如果只是快速打招呼，简短回应也完全可以。" },
      ab: { en: "Nice try!", zh: "分享近况并回问也可以，不过通常可以先简单回应一句。" },
      rab: {
        en: "Nice way to keep chatting!",
        zh: "如果双方有时间，这样多聊几句也挺自然；但在咖啡店快速打招呼时，简短回应通常就够了。",
      },
    },
  },
  {
    id: "neighbor",
    name: "Neighbor",
    icon: "🏠",
    image: "/assets/guided-practice/neighbor.webp",
    imageAlt: "两位邻居在小区门前挥手打招呼",
    greeting: "Hey! How's it going?",
    feedback: {
      r: { en: "Nice choice!", zh: "简单回应也很自然。如果想继续聊，可以多说一点。" },
      a: { en: "Good start!", zh: "分享近况很自然，也可以先简单回应对方。" },
      b: { en: "Friendly choice!", zh: "主动回问可以延续交流，也可以先回应对方。" },
      ra: { en: "Sounds natural!", zh: "回应后分享一点近况，让邻居更了解你。" },
      rb: { en: "Nice way to connect!", zh: "你回应并回问，让双方都有机会继续聊。" },
      ab: { en: "Nice try!", zh: "你分享了近况并主动回问，也可以先加一句回应。" },
      rab: {
        en: "Sounds natural!",
        zh: "你回应、分享了近况并回问。如果双方愿意继续聊，这样可以拉近彼此的关系。",
      },
    },
  },
];

/** Selected expressions in Conversation Formula order, whatever order they were ticked in. */
function inFormulaOrder(selectedIds: ReadonlySet<string>): RoleExpression[] {
  return CORE_EXPRESSIONS.filter((expression) => selectedIds.has(expression.id));
}

/** The matrix key for a selection, or `null` when nothing is ticked. */
export function selectionKey(selectedIds: ReadonlySet<string>): SelectionKey | null {
  const key = inFormulaOrder(selectedIds)
    .map((expression) => ROLE_LETTER[expression.role])
    .join("");
  return key === "" ? null : (key as SelectionKey);
}

/** The learner's assembled reply, always Respond → Add More → Ask Back; "" when nothing is ticked. */
export function assembleResponse(selectedIds: ReadonlySet<string>): string {
  return inFormulaOrder(selectedIds)
    .map((expression) => expression.lines[0])
    .join(" ");
}

/** Feedback for a Situation × selection; `null` when nothing is ticked. */
export function feedbackFor(situation: Situation, selectedIds: ReadonlySet<string>): Feedback | null {
  const key = selectionKey(selectedIds);
  return key ? situation.feedback[key] : null;
}

/** Every distinct reply the learner can assemble (7), each a line the full-response audio may read. */
export const ASSEMBLED_RESPONSES: { key: SelectionKey; text: string }[] = (
  ["r", "a", "b", "ra", "rb", "ab", "rab"] as const
).map((key) => ({
  key,
  text: assembleResponse(
    new Set(
      CORE_EXPRESSIONS.filter((expression) => key.includes(ROLE_LETTER[expression.role])).map(
        (expression) => expression.id,
      ),
    ),
  ),
}));
