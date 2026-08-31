"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { deleteDailyMessage } from "@/lib/daily-message/actions";

export function DeleteDailyMessageForm({ id }: { id: number }) {
  return (
    <form
      action={deleteDailyMessage}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Delete this rejected daily message for good? This cannot be undone.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="destructive">
        <Trash2 aria-hidden="true" /> Delete
      </Button>
    </form>
  );
}
