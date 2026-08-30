const FALLBACK_MESSAGE = "Heute wartet der Tagesgruß noch auf seine Freigabe";

/** A status placeholder, never an unreviewed substitute for editorial content. */
export function fallbackDailyMessage() {
  return FALLBACK_MESSAGE;
}
