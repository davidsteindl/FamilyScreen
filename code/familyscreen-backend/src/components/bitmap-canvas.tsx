"use client";

import { useEffect, useRef } from "react";

import { BITMAP_HEIGHT, BITMAP_WIDTH, unpackBitmap } from "@/lib/screen/bitmap";
import { cn } from "@/lib/utils";

type BitmapCanvasProps = {
  /** Base64 encoded, packed 1 bpp bitmap, as served by /api/device/full. */
  bitmap?: string;
  className?: string;
};

export function BitmapCanvas({ bitmap, className }: BitmapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(0, 0, BITMAP_WIDTH, BITMAP_HEIGHT);

    if (!bitmap) {
      return;
    }

    const packed = Uint8Array.from(atob(bitmap), (character) =>
      character.charCodeAt(0),
    );

    context.putImageData(
      new ImageData(unpackBitmap(packed), BITMAP_WIDTH, BITMAP_HEIGHT),
      0,
      0,
    );
  }, [bitmap]);

  return (
    <canvas
      ref={canvasRef}
      width={BITMAP_WIDTH}
      height={BITMAP_HEIGHT}
      className={cn(
        "w-full rounded-lg bg-white ring-1 ring-foreground/10 [image-rendering:pixelated]",
        className,
      )}
    />
  );
}
