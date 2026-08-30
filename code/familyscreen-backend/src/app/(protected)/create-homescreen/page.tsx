import { BitmapCanvas } from "@/components/bitmap-canvas";
import { toBase64 } from "@/lib/bitmap";
import { renderHome } from "@/lib/pages";

export default async function CreateHomescreenPage() {
  // The call the device endpoint makes, so the preview is the bytes it ships.
  const bitmap = await renderHome().then(toBase64, () => undefined);

  return (
    <main className="flex-1 p-8">
      <h1 className="mb-6 text-lg font-medium">Create homescreen</h1>

      {!bitmap && (
        <p className="mb-4 text-sm text-neutral-500">
          Weather is currently unavailable.
        </p>
      )}

      <BitmapCanvas bitmap={bitmap} className="max-w-3xl" />
    </main>
  );
}
