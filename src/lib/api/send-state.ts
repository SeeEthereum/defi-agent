/**
 * Answers that tell the user whether money may already have moved.
 *
 * Shared by the server (lib/api/duplicate-guard) and the pages, which
 * otherwise replace most server errors with a generic "failed, try again".
 * These must reach the user as they are: "try again" is the wrong advice
 * when the same transaction is running or may already be on chain.
 */

export const SEND_STATE_CODES = ["duplicate_in_flight", "duplicate_recent", "outcome_unknown"] as const;
export type SendStateCode = (typeof SEND_STATE_CODES)[number];

export const IN_FLIGHT_MESSAGE = "This request is already being processed. Wait for it to finish.";

export const UNKNOWN_OUTCOME_MESSAGE =
  "The wallet backend did not answer in time. The transaction may still go through: check Wallet activity before trying again.";

export function recentMessage(secondsAgo: number): string {
  return `The same request went through ${secondsAgo} seconds ago. Check Wallet activity; to repeat it on purpose, wait a minute and try again.`;
}

export const SEND_STATE_TITLES: Record<SendStateCode, string> = {
  duplicate_in_flight: "Already in progress",
  duplicate_recent: "Already sent",
  outcome_unknown: "Result not known yet",
};

const SEND_STATE_PATTERNS = [
  /already being processed/i,
  /went through \d+ seconds? ago/i,
  /may still go through/i,
];

/** True for a message that must be shown to the user unchanged. */
export function isSendStateMessage(message: string): boolean {
  return SEND_STATE_PATTERNS.some((re) => re.test(message));
}

/** The send-state code of a response body, if it carries one. */
export function sendStateCode(data: unknown): SendStateCode | null {
  const code = (data as { code?: unknown } | null)?.code;
  return typeof code === "string" && (SEND_STATE_CODES as readonly string[]).includes(code)
    ? (code as SendStateCode)
    : null;
}

/** The quote was used, expired or the price moved: a fresh quote is the fix. */
export function isStaleQuote(data: unknown): boolean {
  const code = (data as { code?: unknown } | null)?.code;
  return code === "quote_invalid" || code === "price_moved";
}

/**
 * Message to show for a failed request: the server's own words when they
 * are safe and useful (logged out, insufficient funds, send state), the
 * fallback otherwise.
 */
export function userFacingError(detail: unknown, fallback: string): string {
  const message =
    typeof detail === "string" ? detail : detail instanceof Error ? detail.message : "";
  if (/logged out/i.test(message) || /insufficient funds/i.test(message) || isSendStateMessage(message)) {
    return message;
  }
  return fallback;
}
