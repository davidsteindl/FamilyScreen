import { formatDayHeading, formatTime } from "../content/calendar";
import { BITMAP_HEIGHT, BITMAP_WIDTH } from "./bitmap";
import {
  createBitmap,
  drawText,
  fillRect,
  fitScale,
  GLYPH_HEIGHT,
  strokeRect,
  textWidth,
  wrapText,
  type Bitmap,
} from "./bitmap-render";

const MARGIN = 18;
const PADDING = 22;

function lineHeight(scale: number) {
  return GLYPH_HEIGHT * scale;
}

function drawRight(
  bitmap: Bitmap,
  text: string,
  right: number,
  y: number,
  scale: number,
) {
  drawText(bitmap, text, right - textWidth(text, scale), y, scale);
}

export function renderMessageBitmap({
  sender,
  recipient,
  message,
  sentAt,
}: {
  sender: string;
  recipient: string;
  message: string;
  sentAt?: Date;
}) {
  const bitmap = createBitmap();
  const left = MARGIN + PADDING;
  const right = BITMAP_WIDTH - MARGIN - PADDING;
  const availableWidth = right - left;

  strokeRect(
    bitmap,
    MARGIN,
    MARGIN,
    BITMAP_WIDTH - MARGIN * 2,
    BITMAP_HEIGHT - MARGIN * 2,
    3,
  );

  const heading = `NACHRICHT VON ${sender}`;
  const headingScale = fitScale(heading, availableWidth, 5);
  drawText(bitmap, heading, left, 48, headingScale);

  const ruleY = 48 + lineHeight(headingScale) + 22;
  fillRect(bitmap, left, ruleY, availableWidth, 2);

  const bodyScale = Math.min(
    ...message
      .split(" ")
      .filter(Boolean)
      .map((word) => fitScale(word, availableWidth, 4)),
  );
  const lines = wrapText(message, availableWidth, bodyScale).slice(0, 7);
  const bodyLineHeight = lineHeight(bodyScale) + 12;
  const bodyHeight = Math.max(0, lines.length * bodyLineHeight - 12);
  const bodyTop = Math.max(ruleY + 28, Math.floor((BITMAP_HEIGHT - bodyHeight) / 2));

  lines.forEach((line, index) => {
    drawText(bitmap, line, left, bodyTop + index * bodyLineHeight, bodyScale);
  });

  const footer = sentAt
    ? `${formatDayHeading(sentAt)} ${formatTime(sentAt)}`
    : `TESTSEITE FUER ${recipient}`;
  const footerScale = fitScale(footer, availableWidth, 2);
  drawRight(bitmap, footer, right, BITMAP_HEIGHT - MARGIN - PADDING - lineHeight(footerScale), footerScale);

  return bitmap.bytes;
}

export function renderMockMessage(sender: string, recipient: string) {
  return renderMessageBitmap({
    sender,
    recipient,
    message: `HALLO ${recipient}. DAS IST EINE TESTNACHRICHT. DIE VERBINDUNG FUNKTIONIERT.`,
  });
}
