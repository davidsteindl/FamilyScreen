"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { createDailyMessage } from "./create-action";
import {
  DAILY_MESSAGE_MAX_LENGTH,
  dailyMessageProblems,
} from "./validation";

export function CreateDailyMessageForm() {
  const [result, formAction, pending] = useActionState(
    createDailyMessage,
    undefined,
  );
  const [text, setText] = useState("");

  // The same pure function the action validates with, so the hint shown while
  // typing and the error returned on submit can never disagree.
  const problems = useMemo(() => dailyMessageProblems(text), [text]);

  const created = result !== undefined && "created" in result;

  // Clearing on the render the result arrives in, the way message-composer
  // does, rather than in an effect.
  const [seen, setSeen] = useState(result);

  if (result !== seen) {
    setSeen(result);

    if (created) {
      setText("");
    }
  }

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="daily-message-text">Text</Label>
        <Textarea
          id="daily-message-text"
          name="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={DAILY_MESSAGE_MAX_LENGTH}
          placeholder="Heute ist Omas Geburtstag"
          required
        />
        <p className="text-xs text-neutral-500">
          {DAILY_MESSAGE_MAX_LENGTH - text.length} characters left. Saved as
          approved right away, so it can be picked from the next Vienna calendar
          day on.
        </p>

        {/* Silent while the field is untouched: "Text is empty" is the state an
            empty form is in, not a mistake the writer made. maxLength already
            rules out the length problem here, so what is left is the font. */}
        {text.trim().length > 0 &&
          problems.map((problem) => (
            <p key={problem} className="text-xs text-amber-600">
              {problem}
            </p>
          ))}
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          size="sm"
          disabled={pending || problems.length > 0}
        >
          Save and approve
        </Button>

        {created && (
          <p aria-live="polite" className="text-sm text-emerald-700">
            Saved.{" "}
            <Link
              href="/daily-messages?status=approved"
              className="underline underline-offset-2"
            >
              Show approved entries
            </Link>
          </p>
        )}
      </div>

      {result && "error" in result && (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      )}
    </form>
  );
}
