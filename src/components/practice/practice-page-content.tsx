"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CourseProgressChip } from "@/components/course-progress";
import { AskInChineseSheet } from "@/components/practice/ask-in-chinese-sheet";
import { ConversationProgressSteps } from "@/components/practice/conversation-progress-steps";
import { EmilyAvatar, type EmilyAvatarState } from "@/components/practice/emily-avatar";
import { EmilyInfoCard } from "@/components/practice/emily-info-card";
import { IconBoxButton } from "@/components/practice/icon-box-button";
import { MessageBubblePair } from "@/components/practice/message-bubble-pair";
import { PracticeInputForm } from "@/components/practice/practice-input-form";
import { StageTag } from "@/components/stage-tag";
import { GREETING_SOMEBODY_LESSON, pickRandomOpeningLine } from "@/content/lesson";
import { ACTIVE_CONVERSATION_STATES } from "@/lib/conversation-state-machine";
import { containsChineseText } from "@/lib/detect-chinese-input";
import { selectEmilyLinesForTurn, selectSilenceNudge } from "@/lib/emily-reply-selector";
import { deriveVerdict } from "@/lib/goal-progress";
import { markStepComplete } from "@/lib/progress";
import { getCurrentTurnEmilyMessages, usePractice } from "@/lib/practice-state";
import { cancelSpeech, speakLinesAssertively } from "@/lib/speech-synthesis";
import { submitPracticeTurn } from "@/lib/submit-practice-turn";
import { matchesAcceptedResponse } from "@/lib/turn-record";

/**
 * `support_requested` response (issue #18) shown when the learner types
 * Chinese straight into the main reply box, rather than tapping "中文提问"
 * (which opens `AskInChineseSheet`'s real help mode — issue #19 — with its
 * own 4-part canned explanation and Chinese follow-up conversation for the
 * Focus Goal). Appended via `appendSupportMessage` — same as the silence
 * nudge — so it never moves Goal Progress and never contributes a Turn record
 * to the Learning Summary (CONTEXT.md "Focus Goal": a `support_requested` Turn
 * Outcome never changes it).
 *
 * Deliberately minimal: typing Chinese into the main reply box only nudges
 * the learner toward the help button rather than opening a full explanation
 * itself, so it just needs to acknowledge the input without crashing or
 * ever reaching the Judge.
 */
const CHINESE_INPUT_SUPPORT_NUDGE = {
  en: "Let's try that in English!",
  zh: "看起来你打的是中文——我们试着用英语说说看吧！需要提示的话，可以点旁边的「中文提问」。",
};

/** How long Emily's avatar stays in the "talking" state after a new line lands, before settling back to idle. */
const TALKING_DURATION_MS = 1400;

/**
 * The most recent Emily message id the reply-autoplay effect below has
 * already fired `speakLinesAssertively` for — module-scoped, not a
 * component ref, deliberately: a `useRef` resets on any full remount of the
 * component (React Strict Mode's dev-only double-invoke of effects, or a
 * Fast Refresh reload), but the store-persisted message id doesn't, so
 * keying on it here survives a remount without risking the same line
 * audibly playing twice. Since #48 it is the *last* line of a Turn's
 * sequence, which is what makes one Turn's whole sequence play once.
 */
let autoSpokenMessageId: string | undefined;

/**
 * How long the learner can go without submitting a reply before Emily sends
 * one gentle nudge (ticket 10; spec.md "Practice 页交互模型": "无响应计时
 * 15–20 秒触发一次鼓励语，不推进状态，不提供答案"; user story 62). Picked at
 * the middle of the spec's 15-20s range.
 */
const SILENCE_TIMEOUT_MS = 18000;

/**
 * Practice page body: a text-driven conversation with Emily that walks the
 * learner through the Lesson's four Conversation Goals (ticket 08; spec.md
 * "Practice 页交互模型"; issue #47 turned the old 4-state Conversation State
 * Machine into Goal Progress — see src/lib/goal-progress.ts). Split out from
 * page.tsx (a Server Component, so it can keep exporting `metadata`) for the
 * same reason as Explore's page/content split — everything here is client-only
 * state (the practice store, in-flight request status, avatar animation
 * timing).
 *
 * Issue #48: one learner Turn can achieve several Goals, so the judged Turn
 * produces a *sequence* of Emily lines — selected here
 * (src/lib/emily-reply-selector.ts), persisted as one message each
 * (src/lib/practice-state.ts), shown joined in the one current-turn bubble
 * and spoken as one sequence (src/lib/speech-synthesis.ts's
 * `speakLinesAssertively`), which is what keeps Turn-Taking closed until the
 * last line ends.
 *
 * Voice input (ticket 09, still landing in a sibling worktree against this
 * same file) is explicitly out of scope here — this page's text form must
 * work standalone. Support & recovery features (ticket 10 — bilingual
 * subtitle toggle, replay, Ask-in-Chinese sheet, silence-timeout nudge, full
 * transcript drawer) are wired in below; per spec.md's "Practice 页交互模型"
 * they must never move Goal Progress or call the LLM proxy route themselves.
 */
export function PracticePageContent() {
  const router = useRouter();
  const {
    goalProgress,
    focusGoal,
    messages,
    isComplete,
    ensureOpeningMessage,
    appendLearnerMessage,
    recordTurnResult,
    appendSupportMessage,
    resetPractice,
  } = usePractice();

  const [avatarState, setAvatarState] = useState<EmilyAvatarState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAskInChineseOpen, setIsAskInChineseOpen] = useState(false);
  // Mirrors the id of the Emily message the "talking" beat was last started
  // for — see the render-time adjustment below.
  const [talkingForMessageId, setTalkingForMessageId] = useState<string | undefined>(undefined);

  const openingPickedRef = useRef(false);
  // Tracks the in-flight submitPracticeTurn request, if any, so the cleanup
  // effect below can abort it on unmount — same ref-plus-unmount-cleanup
  // shape as practice-input-form.tsx's `controllerRef`/`startListening`.
  const submitControllerRef = useRef<AbortController | null>(null);
  // Whether the reply-autoplay effect below has run at least once for this
  // mount. Its first run must never blindly speak whatever Emily message is
  // already on screen — a session resumed mid-conversation already has that
  // message rendered from persisted history, and replaying it out loud on
  // every page load/refresh isn't something anything here asks for. The
  // opening line is the one deliberate exception (handled inside the effect
  // by its own messages.length === 1 check, independent of this ref) since
  // hearing the greeting again on a refresh before the learner has replied
  // is the same "nothing has happened yet" state as a fresh start. A ref is
  // correct here (unlike autoSpokenMessageId above): it resets on Strict
  // Mode's fake remount same as any other ref, and we want a fresh "haven't
  // checked yet" on every real mount too.
  const hasCheckedReplyAutoplayRef = useRef(false);
  // The `.en` text of whichever silence nudge was shown last this mount, or
  // `undefined` if none has fired yet — `selectSilenceNudge` uses this to
  // never repeat the same nudge twice in a row (docs/ai-configuration.md
  // section 3). A ref, not store state: which nudge played last is a purely
  // local selection concern, not persisted conversation data.
  const lastNudgeTextRef = useRef<string | undefined>(undefined);

  // Opening line: picked once per mount, only actually applied by
  // ensureOpeningMessage if the transcript is still empty (fresh start). A
  // resumed/refreshed session already has message #1 persisted, so the
  // freshly-picked-but-unused line here is simply discarded.
  useEffect(() => {
    if (openingPickedRef.current) return;
    openingPickedRef.current = true;
    ensureOpeningMessage(pickRandomOpeningLine());
  }, [ensureOpeningMessage]);

  // Stop any in-flight turn submission if the learner navigates away mid-request.
  useEffect(() => {
    return () => {
      submitControllerRef.current?.abort();
    };
  }, []);

  // Issue #48: this Turn's Emily lines, in order — one line for a one-Goal
  // Turn, two when Emily reacted to a check-in and then steered (see
  // src/lib/emily-reply-selector.ts). The bubble shows them joined, and the
  // autoplay effect below speaks them as one sequence.
  const currentTurnEmilyLines = getCurrentTurnEmilyMessages(messages);
  const lastEmilyLine = currentTurnEmilyLines[currentTurnEmilyLines.length - 1] ?? null;
  const lastMessage = messages[messages.length - 1];
  const learnerMessage = lastMessage?.role === "learner" ? lastMessage : null;

  // Whenever a new Emily line lands (the opening line, or a fresh reply),
  // kick off a brief "talking" beat — one beat per Turn's whole sequence, so
  // it keys off that sequence's last line. This adjusts state during render
  // (React's documented pattern for reacting to a changed value —
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // rather than in a useEffect body: this repo's lint config
  // (react-hooks/set-state-in-effect) flags a setState call made directly
  // and synchronously in an effect as a cascading-render risk.
  if (lastEmilyLine && lastEmilyLine.id !== talkingForMessageId) {
    setTalkingForMessageId(lastEmilyLine.id);
    setAvatarState("talking");
  }

  // The matching return-to-idle transition is a genuine timer side effect,
  // so it stays in an Effect — but the setState call lives inside the
  // setTimeout callback, not directly in the effect body, which is exactly
  // the shape react-hooks/set-state-in-effect allows ("calling setState in
  // a callback function when external state changes").
  useEffect(() => {
    if (avatarState !== "talking") return;
    const timeoutId = setTimeout(() => setAvatarState("idle"), TALKING_DURATION_MS);
    return () => clearTimeout(timeoutId);
  }, [avatarState]);

  // Emily speaks every one of her lines proactively — the opening line, and
  // every reply after it — so the learner hears her without ever needing the
  // manual 🔊 replay tap. Every line uses `speakLinesAssertively`: the reusable
  // audio element should normally have been unlocked by the learner's first
  // gesture, while the retry remains a safety net for WebKit versions that
  // still reject a later programmatic play. One call per Turn speaks that
  // Turn's whole sequence — one speaking owner, one Handoff Gap at the end —
  // so Turn-Taking holds across both of Emily's lines rather than handing the
  // mic back between them (#48; see src/lib/speech-synthesis.ts).
  //
  // `hasCheckedReplyAutoplayRef` distinguishes a genuinely new reply that
  // arrived during this session from a resumed session's already-persisted
  // last message (see that ref's own doc comment) — without it, every page
  // load/refresh mid-conversation would replay Emily's last line out loud.
  // `autoSpokenMessageId` (module scope, keyed on the *last* line's own id)
  // guards against speaking the exact same Turn twice — including across a
  // restarted conversation's new opening line, a genuinely new id that
  // auto-plays again with no manual reset needed — see handleRestart.
  useEffect(() => {
    const isOpeningLine = messages.length === 1;
    // False only on this effect's very first run after mount; true from its
    // second run onward. Since the dependency array below only re-runs this
    // effect when the transcript actually changes, "not the first run"
    // reliably means a live event happened during this session (a new reply,
    // a support nudge, or a restart) rather than a resumed session's
    // already-persisted history rendering for the first time.
    const isLiveUpdate = hasCheckedReplyAutoplayRef.current;
    hasCheckedReplyAutoplayRef.current = true;

    // Re-derived from `messages` (the dependency) rather than read off the
    // render's own `currentTurnEmilyLines`, so this effect's inputs are all
    // declared and nothing goes stale.
    const lines = getCurrentTurnEmilyMessages(messages);
    const lastLine = lines[lines.length - 1];
    if (isAskInChineseOpen || !lastLine || (!isOpeningLine && !isLiveUpdate)) return;
    if (autoSpokenMessageId === lastLine.id) return;
    autoSpokenMessageId = lastLine.id;

    return speakLinesAssertively(lines.map((line) => line.textEn));
  }, [messages, isAskInChineseOpen]);

  // Chinese help owns the floor from the moment it opens. This also clears
  // any pending `speakLinesAssertively` gesture retry from the English
  // conversation.
  useEffect(() => {
    if (isAskInChineseOpen) cancelSpeech();
  }, [isAskInChineseOpen]);

  // Silence-timeout nudge: a single-shot timer keyed off the last message's
  // id (or its absence, before the opening line lands) — any new message
  // (a learner submission, Emily's graded reply, or this nudge itself)
  // reruns the effect and re-arms a fresh window, so this fires once per
  // stretch of continued silence rather than on a repeating interval. Stays
  // idle while a turn is mid-flight (`isSubmitting`) so the nudge never
  // fires while Emily is "thinking", and stops entirely once the
  // conversation is complete. Deliberately calls `appendSupportMessage`
  // directly, never `recordTurnResult` — no LLM call, no state transition.
  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (isComplete || isSubmitting || isAskInChineseOpen) return;
    const timeoutId = setTimeout(() => {
      // Issue #16 (docs/ai-configuration.md section 3): the silence nudge is
      // now a 3-line pool, not one fixed line — picked so it never repeats
      // the immediately preceding nudge's text twice in a row.
      const nudge = selectSilenceNudge(GREETING_SOMEBODY_LESSON, lastNudgeTextRef.current);
      lastNudgeTextRef.current = nudge.en;
      appendSupportMessage(nudge);
    }, SILENCE_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [lastMessageId, isComplete, isSubmitting, isAskInChineseOpen, appendSupportMessage]);

  async function handleSubmit(text: string) {
    // `focusGoal` is null exactly when Practice is complete, so this is the
    // same guard the input form's own `disabled` state expresses — and the
    // null check is what lets TypeScript treat the Focus Goal as an
    // `ActiveConversationState` for the rest of this function.
    if (isComplete || isSubmitting || focusGoal === null) return;

    // Turn Outcome resolution (issue #18; docs/ai-configuration.md section 4;
    // CONTEXT.md's Turn Outcome glossary entry): Chinese input is detected
    // here, client-side, BEFORE the Judge is ever called — it resolves
    // straight to `support_requested` and never becomes a Verdict. The
    // learner's input is still echoed (same as any other turn) and Emily
    // still responds, but purely through `appendSupportMessage`, which never
    // touches Goal Progress and never records a Turn — a support_requested
    // Turn contributes nothing to the Learning Summary. The Focus Goal is
    // deliberately untouched too.
    if (containsChineseText(text)) {
      setErrorMessage(null);
      appendLearnerMessage(text);
      appendSupportMessage(CHINESE_INPUT_SUPPORT_NUDGE);
      setAvatarState("idle");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    appendLearnerMessage(text);
    setAvatarState("thinking");

    const history = messages.map((message) => ({
      role: message.role === "emily" ? ("assistant" as const) : ("user" as const),
      content: message.textEn,
    }));

    const controller = new AbortController();
    submitControllerRef.current = controller;

    // submitPracticeTurn never throws — it resolves a discriminated result,
    // so every failure path (network failure, non-2xx status, a stream
    // `error` event, the stream ending without `final`, or this request
    // being aborted) is handled explicitly below instead of via try/catch.
    const result = await submitPracticeTurn(
      { goalProgress, message: text, history },
      { signal: controller.signal },
    );

    if (result.ok) {
      // Issue #47 (ADR-0012): the Judge returns a Goal Report, not a Verdict —
      // the Verdict is derived here (all-or-nothing: at least one open Goal
      // achieved, none failed). Emily's lines are still selected client-side,
      // at random from the Lesson's fixed Conversation Script pools.
      //
      // Issue #48: the selector is handed the Goal Progress the report was
      // judged against plus the report itself, so it can tell which Goals
      // *this Turn* achieved — it needs that, not only where Goal Progress
      // ended up, to know whether a reaction line is due — and returns the
      // ordered sequence of lines Emily speaks (see its own doc comment for
      // the composition). The store persists one message per line in a single
      // write, and the autoplay effect above speaks the same sequence.
      const { goal_report: goalReport, learner_asked_back: learnerAskedBack } = result.data;
      const verdict = deriveVerdict(goalProgress, goalReport);
      const replyLines = selectEmilyLinesForTurn(GREETING_SOMEBODY_LESSON, {
        verdict,
        progressBeforeTurn: goalProgress,
        goalReport,
        learnerAskedBack,
      });
      // Issue #20 (#12's "Learning Summary inputs are derived, not
      // reported"): whether the learner's text matched an Accepted Response is
      // computed here, client-side, rather than reported by the model — the
      // same "compare against Lesson.script[goal].acceptedResponses" the
      // system prompt already hands the model as guidance, but as a real
      // client-side check feeding the Learning Summary's per-Turn records.
      // Exact whole-sentence match, and since issue #51 against *every* Goal
      // rather than only the Focus Goal, because one Turn can achieve several
      // (ADR-0012): a sentence that achieves several Goals matches none of
      // them, so this set is empty for a multi-Goal Turn and the store — which
      // stays ignorant of Lesson content — intersects it with the Goals the
      // Turn achieved.
      recordTurnResult({
        focusGoal,
        verdict,
        goalReport,
        replyLines,
        matchedAcceptedResponseGoals: ACTIVE_CONVERSATION_STATES.filter((goal) =>
          matchesAcceptedResponse(text, GREETING_SOMEBODY_LESSON.script[goal].acceptedResponses),
        ),
        learnerAskedBack,
      });
      setIsSubmitting(false);
      return;
    }

    if (result.reason === "aborted") {
      // The component is unmounting or this request was superseded — there
      // is nothing left to show the learner, so skip errorMessage/avatarState.
      return;
    }

    console.error("Practice turn failed", result.reason);
    setErrorMessage("Emily 好像没收到消息，请再试一次。 Something went wrong — please try again.");
    setAvatarState("idle");
    setIsSubmitting(false);
  }

  function handleViewSummary() {
    if (!isComplete) return;
    markStepComplete("practice");
    router.push("/review");
  }

  // Clean-slate restart, staying on /practice (unlike Review's "重练"
  // button, which navigates back here to trigger the same reset via a fresh
  // mount) — clears the store, then immediately re-seeds a new opening line
  // so the page never sits without one. The new line gets a genuinely new
  // message id, so the auto-play effect above picks it up on its own with no
  // manual reset needed here.
  function handleRestart() {
    submitControllerRef.current?.abort();
    resetPractice();
    ensureOpeningMessage(pickRandomOpeningLine());
    setErrorMessage(null);
    setIsSubmitting(false);
    setIsAskInChineseOpen(false);
    lastNudgeTextRef.current = undefined;
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <StageTag label="Practice" icon="🎙" asHeading />
        <CourseProgressChip />
      </div>

      <EmilyAvatar
        state={avatarState}
        topOverlay={<EmilyInfoCard />}
        headlineOverlay={
          <div className="flex flex-col gap-1.5">
            <h2 className="text-h3 leading-tight font-bold text-accent">{GREETING_SOMEBODY_LESSON.headline.en}</h2>
            <p className="text-body-sm font-semibold text-accent">{GREETING_SOMEBODY_LESSON.headline.zh}</p>
            <p className="text-[8px] leading-snug text-foreground/80">
              和 Emily 进行真实对话练习，
              <br />
              建立自信，轻松开口说英语！
            </p>
          </div>
        }
        bottomOverlay={
          <MessageBubblePair
            key={lastEmilyLine?.id}
            emilyMessages={currentTurnEmilyLines.map((line) => ({
              textEn: line.textEn,
              textZh: line.textZh,
            }))}
            learnerMessage={learnerMessage ? { textEn: learnerMessage.textEn, textZh: learnerMessage.textZh } : null}
          />
        }
      />

      <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
        <p className="text-center text-body-lg font-semibold text-foreground">
          <span aria-hidden>🎙</span> Your turn 你的发言
        </p>

        {errorMessage ? (
          <p role="alert" data-testid="practice-error" className="text-body-sm text-danger">
            {errorMessage}
          </p>
        ) : null}

        <PracticeInputForm
          disabled={isComplete || isSubmitting}
          onSubmit={handleSubmit}
          asideAction={
            <IconBoxButton
              icon="💬"
              lineOne="中文提问"
              lineTwo="Ask in Chinese"
              onClick={() => setIsAskInChineseOpen(true)}
              disabled={isComplete}
              data-testid="ask-in-chinese-button"
            />
          }
        />
      </div>

      <ConversationProgressSteps goalProgress={goalProgress} />

      {isAskInChineseOpen && focusGoal ? (
        <AskInChineseSheet
          focusGoal={focusGoal}
          onClose={() => setIsAskInChineseOpen(false)}
          onExitWithEnglishInput={(text) => {
            // Issue #19 acceptance criterion 6: speaking/typing English
            // while help mode is open exits help mode automatically, and
            // the English text is submitted as a normal Practice turn
            // rather than discarded — this reuses handleSubmit unchanged,
            // which itself already special-cases Chinese input, so English
            // text here just flows through the normal Judge path.
            setIsAskInChineseOpen(false);
            void handleSubmit(text);
          }}
        />
      ) : null}

      <div className="mt-auto flex flex-col gap-3 pt-6">
        <button
          type="button"
          onClick={handleRestart}
          data-testid="restart-practice-button"
          className="btn-outline w-full"
        >
          重新练习 Restart Practice
        </button>
        <button
          type="button"
          disabled={!isComplete}
          onClick={handleViewSummary}
          data-testid="view-summary-button"
          className="btn-primary flex w-full items-center justify-center gap-2"
        >
          查看学习总结 View Learning Summary <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}
