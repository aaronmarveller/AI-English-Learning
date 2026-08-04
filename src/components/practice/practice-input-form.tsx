"use client";

import { useState, type FormEvent } from "react";

type PracticeInputFormProps = {
  disabled: boolean;
  onSubmit: (text: string) => void;
};

/**
 * The learner's text input (ticket 08 — this ticket's ONLY input method;
 * ticket 09 adds voice on top of it later, standalone-capable already).
 * A real `<form>` with `onSubmit`: Enter-to-submit comes for free from the
 * browser's native form submission on a single-line `<input>`, and the
 * button also works via click — both paths call `handleSubmit` so there is
 * exactly one submission code path to keep in sync with `disabled`.
 */
export function PracticeInputForm({ disabled, onSubmit }: PracticeInputFormProps) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (disabled || trimmed.length === 0) return;
    onSubmit(trimmed);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} data-testid="practice-input-form" className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
        placeholder="用英文打字回复 Emily... Type your reply"
        aria-label="你的回复 Your reply"
        data-testid="practice-text-input"
        className="min-w-0 flex-1 rounded-button border border-border bg-card px-4 py-3 text-body-lg text-foreground disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || value.trim().length === 0}
        data-testid="practice-send-button"
        className="btn-primary shrink-0 px-5 py-3 active:scale-95 active:brightness-90"
      >
        发送 Send
      </button>
    </form>
  );
}
