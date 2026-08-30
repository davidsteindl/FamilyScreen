export const DAILY_MESSAGE_MAX_LENGTH = 110;

export const DAILY_MESSAGE_CATEGORIES = [
  "dialect",
  "joke",
  "bonmot",
  "saying",
] as const;

export type DailyMessageCategory =
  (typeof DAILY_MESSAGE_CATEGORIES)[number];

export type DailyMessageStatus = "pending" | "approved" | "rejected";

// Matches the tiny bitmap font. Diacritics and umlauts are normalized by the
// renderer; the remaining punctuation is deliberately conservative.
const DISPLAYABLE_TEXT = /^[\p{L}\p{N} .,:;!?()"+%&/_-]+$/u;

export function dailyMessageProblems(text: string) {
  const problems: string[] = [];
  const trimmed = text.trim();

  if (!trimmed) {
    problems.push("Text is empty");
  }

  if (trimmed.length > DAILY_MESSAGE_MAX_LENGTH) {
    problems.push(
      `Text has ${trimmed.length} characters; the maximum is ${DAILY_MESSAGE_MAX_LENGTH}`,
    );
  }

  if (!DISPLAYABLE_TEXT.test(trimmed)) {
    problems.push("Text contains characters the device font cannot display");
  }

  return problems;
}

