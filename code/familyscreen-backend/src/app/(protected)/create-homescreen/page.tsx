import { BitmapCanvas } from "@/components/bitmap-canvas";
import { toBase64 } from "@/lib/screen/bitmap";
import { renderHome } from "@/lib/screen/pages";

// Without this the build prerenders the page, and rendering it claims the day's
// message and calls the model. The page ends up dynamic either way because the
// layout reads the session, but only after that write has already happened.
export const dynamic = "force-dynamic";

export default async function CreateHomescreenPage() {
  // The call the device endpoint makes, so the preview is the bytes it ships.
  const bitmap = await renderHome().then(toBase64, () => undefined);

  return (
    <>
      <h1 className="mb-6 text-lg font-medium">Create homescreen</h1>

      {!bitmap && (
        <p className="mb-4 text-sm text-neutral-500">
          Weather is currently unavailable.
        </p>
      )}

      <BitmapCanvas bitmap={bitmap} className="max-w-3xl" />
    </>
  );
}
