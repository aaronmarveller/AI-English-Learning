# CONTEXT

Domain glossary for AI-English-Learning. Use these terms as defined here in code, commits, issues, and docs — don't drift to synonyms.

## Lesson

One self-contained scenario the learner practices end to end, owning the topic Emily keeps the conversation on. Today there is exactly one: `Greeting Someone` — greeting someone, "How are you today?", and saying goodbye.

## Learning Objective

Something a Lesson promises the learner will be able to do once they finish it, shown before they start. A Lesson has a few; one may be marked optional. Purely a promise to read — nothing in the learning flow checks, scores, or tracks it.
_Avoid_: Goal — the retired Conversation Goal family was tracked during Practice; a Learning Objective never is

## Notice Card

One of the three cards on the Notice stage. Each poses a question about what an everyday English greeting really means, contrasts two readings of it side by side, and closes with a tip. Opening one is optional — nothing checks whether the learner read any.
_Avoid_: Cultural Insight Card — the retired US-vs-China comparison the Notice Cards replaced

## Practice

The learning-flow stage where the learner talks with Emily out loud. It is made up of at most three Calls, and it is complete once a Call has ended in which the learner said at least one line in English or Chinese. A Call counts toward the three as soon as it connects, even if the learner says nothing; only starting Practice over from Review grants three again.

## Call

One live voice conversation with Emily, from "开始对话" until it ends — by the learner hanging up or by the 45-second limit. The 45 seconds start only after Emily has finished her opening line, so her greeting never eats into the learner's time. With about eight seconds left Emily says goodbye, and a Call that runs out ends only once her current line is finished. Emily improvises within the Lesson's topic, steering any off-topic line back to it.
_Avoid_: Session, Live Practice — Session collides with the API's own term, and Practice is the stage that contains Calls

## Turn

One exchange inside a Call: something the learner says, plus Emily's reply to it. The learner's part ends after one second of silence. A Turn is never judged — there is no Verdict.

## Chinese Help

The learner switching to Chinese mid-Call to ask about the conversation itself — what Emily meant, how to reply. Emily answers briefly in Chinese, then invites them back into English; a Chinese question unrelated to the conversation is declined. Any language other than English or Chinese is not understood at all.

## Turn-Taking

Who holds the floor: Emily and the learner never hold it at the same time. The learner cannot interrupt Emily mid-line, nor speak during the Handoff Gap that follows it, and Emily never begins a line while the learner is speaking. A product rule, not a device workaround — it is what keeps a Turn a clean exchange instead of two voices competing for one microphone.
_Avoid_: barge-in — interrupting Emily mid-line is deliberately not offered

## Handoff Gap

The short beat — about half a second — after Emily's line ends in which the floor belongs to neither side: she has finished, and the learner may not start yet. Part of Turn-Taking rather than a delay bolted onto it; it also keeps the tail of her voice from being heard as the learner's.

## Learning Summary

The learner-facing recap shown after Practice. It presents one Praise, two or three Highlights, one Suggestion, and one Closing in that order, written from everything the learner said across all of their Calls. Addressed to the learner in Chinese, with English surviving only as the learner's own expressions and short better alternatives.
_Avoid_: Review in learner-facing copy

## Review

The internal name of the post-Practice learning-flow stage that presents the Learning Summary and offers retry or continue actions.
_Avoid_: Learning Summary when naming the internal flow stage

## Retired terms

The scripted Practice was replaced by live Calls. These terms named parts of it and must not be reused for anything in the new model: Verdict, Turn Outcome, Recovery, Retry Streak, Conversation Script, Conversation Goal, Goal Report, Goal Progress, Focus Goal, Conversation State, Tap-to-Talk, Silence Reminder, Judge / Submit seam.

The Notice stage's US-vs-China cultural comparison was replaced by Notice Cards; Cultural Insight Card must not be reused either.
