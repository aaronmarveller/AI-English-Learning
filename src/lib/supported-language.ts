/**
 * Only English and Chinese are supported in a Call (CONTEXT.md "Chinese
 * Help"). The speech-to-text model can't be restricted to two languages — a
 * `prompt` hint had no effect in testing — so a transcript written in a
 * script that is clearly neither is flagged here. Latin-script languages such
 * as Spanish slip through; Emily's instructions (src/content/call-prompt.ts)
 * cover those by declining in-conversation.
 */
const UNSUPPORTED_SCRIPT =
  /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Thai}\p{Script=Devanagari}\p{Script=Greek}\p{Script=Hebrew}]/u;

/** True when `text` carries at least one letter or ideograph, i.e. is not blank or bare punctuation. */
const HAS_LETTER = /[\p{L}\p{N}]/u;

/**
 * Whether a learner's transcribed line counts as something they said in
 * English or Chinese: non-empty and not written in a clearly unsupported
 * script. Used both to unlock the Learning Summary and to filter what the
 * summary is written from.
 */
export function isSupportedLearnerText(text: string): boolean {
  const trimmed = text.trim();
  return HAS_LETTER.test(trimmed) && !UNSUPPORTED_SCRIPT.test(trimmed);
}
