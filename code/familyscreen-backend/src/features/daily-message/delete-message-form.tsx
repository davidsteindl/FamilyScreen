"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { deleteDailyMessage } from "./review-actions";

export function DeleteDailyMessageForm({ id }: { id: number }) {
  return (
    <form
      action={deleteDailyMessage}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Diesen abgelehnten Tagesinhalt endgültig löschen? Das kann nicht rückgängig gemacht werden.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="destructive">
        <Trash2 aria-hidden="true" /> Löschen
      </Button>
    </form>
  );
}
