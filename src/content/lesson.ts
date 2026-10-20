/**
 * The Lesson (CONTEXT.md "Lesson"): one self-contained scenario the learner
 * practices end to end. Today there is exactly one, "Greeting Somebody" —
 * greeting someone, "How are you today?", and saying goodbye.
 *
 * Emily's behaviour inside a Call (what she says, how she steers back to the
 * topic) is her instructions, in src/app/api/realtime/session/route.ts; this
 * file holds only the learner-facing copy that frames the Lesson.
 *
 * Deliberately shallow: a multi-Lesson abstraction built against a single
 * example would almost certainly be wrong.
 */

export type Lesson = {
  /** Editorial hero headline (UI draft, 2026-08-06 review). */
  headline: { en: string; zh: string };
};

export const GREETING_SOMEBODY_LESSON: Lesson = {
  headline: {
    en: "Say hello to Emily.",
    zh: "和 Emily 真实练习打招呼。",
  },
};
