"use client";

import { useActionState, useMemo, useRef, useState } from "react";

import { BitmapCanvas } from "@/components/bitmap-canvas";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toBase64 } from "@/lib/screen/bitmap";
import { unsupportedCharacters, type Tile } from "@/lib/screen/bitmap-render";
import { fileToTile } from "@/lib/screen/image-tile";
import {
  IMAGE_MAX_HEIGHT,
  IMAGE_MAX_WIDTH,
  renderMessage,
} from "@/lib/screen/message";
import { sendMessage } from "@/lib/send-message";

const MAX_LENGTH = 280;

// The look of ui/input.tsx, on the one control shadcn has no dependency-free
// version of. A native select submits with the form on its own.
const CONTROL =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

type Contact = { userId: string; name: string };

type MessageComposerProps = {
  contacts: Contact[];
  senderName: string;
};

export function MessageComposer({
  contacts,
  senderName,
}: MessageComposerProps) {
  const [result, formAction, pending] = useActionState(sendMessage, undefined);

  const [text, setText] = useState("");
  const [tile, setTile] = useState<Tile>();
  const [imageError, setImageError] = useState<string>();

  const fileRef = useRef<HTMLInputElement>(null);

  // Rendering is a few thousand setPixel calls on 40 kB, well under a
  // millisecond, so the preview can just follow every keystroke. This is what
  // the isomorphic renderer was for: the bytes drawn here are the bytes stored.
  const preview = useMemo(
    () =>
      toBase64(
        renderMessage({
          from: senderName,
          sentAt: new Date(),
          text,
          image: tile,
        }),
      ),
    [senderName, text, tile],
  );

  const missing = useMemo(() => unsupportedCharacters(text), [text]);

  const sent = result !== undefined && "sent" in result;

  // Clearing on the render the result arrives in, rather than in an effect:
  // React's documented way to react to a changed prop without a cascading pass.
  const [seen, setSeen] = useState(result);
  // Bumping this remounts the file input, which is the only way to clear one
  // without writing to its ref during render.
  const [generation, setGeneration] = useState(0);

  if (result !== seen) {
    setSeen(result);

    if (sent) {
      setText("");
      setTile(undefined);
      setImageError(undefined);
      setGeneration((previous) => previous + 1);
    }
  }

  const clearImage = () => {
    setTile(undefined);
    setImageError(undefined);

    if (fileRef.current) {
      fileRef.current.value = "";
    }
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) {
      clearImage();
      return;
    }

    try {
      setImageError(undefined);
      setTile(await fileToTile(file, IMAGE_MAX_WIDTH, IMAGE_MAX_HEIGHT));
    } catch {
      clearImage();
      setImageError("That file could not be read as an image.");
    }
  };

  if (contacts.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        You have no contacts yet, so there is nobody to write to.
      </p>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <form action={formAction} className="flex flex-col gap-6">
        <div className="grid gap-2">
          <Label htmlFor="recipientId">To</Label>
          <select id="recipientId" name="recipientId" className={CONTROL}>
            {contacts.map((contact) => (
              <option key={contact.userId} value={contact.userId}>
                {contact.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="text">Message</Label>
          <Textarea
            id="text"
            name="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MAX_LENGTH}
            placeholder="Hallo Oma"
            required
          />
          <p className="text-xs text-neutral-500">
            {MAX_LENGTH - text.length} characters left
          </p>

          {missing.length > 0 && (
            <p className="text-xs text-amber-600">
              The screen font cannot draw {missing.join(" ")} — those characters
              will be blank.
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="image">Picture (optional)</Label>
          <input
            key={generation}
            ref={fileRef}
            id="image"
            type="file"
            accept="image/*"
            className="text-sm file:mr-3 file:rounded-lg file:border file:border-input file:bg-transparent file:px-2.5 file:py-1 file:text-sm"
            onChange={(event) => pickImage(event.target.files?.[0])}
          />

          {tile && (
            <div className="flex items-center gap-3 text-xs text-neutral-500">
              <span>
                {tile.width} × {tile.height}
              </span>
              <button
                type="button"
                onClick={clearImage}
                className="underline underline-offset-2"
              >
                Remove
              </button>
            </div>
          )}

          {imageError && (
            <p role="alert" className="text-xs text-destructive">
              {imageError}
            </p>
          )}
        </div>

        {/* The picture travels as the 1 bpp tile that was previewed, not as the
            original file: the message is the bitmap. */}
        {tile && (
          <>
            <input type="hidden" name="imageWidth" value={tile.width} />
            <input type="hidden" name="imageHeight" value={tile.height} />
            <input
              type="hidden"
              name="imageBytes"
              value={toBase64(tile.bytes)}
            />
          </>
        )}

        <Button type="submit" disabled={pending}>
          Send
        </Button>

        {result && "error" in result && (
          <p role="alert" className="text-sm text-destructive">
            {result.error}
          </p>
        )}

        {sent && <p className="text-sm text-emerald-600">Message sent.</p>}
      </form>

      <div>
        <p className="mb-2 text-sm text-neutral-500">
          Exactly what the screen will show.
        </p>
        <BitmapCanvas bitmap={preview} />
      </div>
    </div>
  );
}
