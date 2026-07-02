/**
 * Maps raw decline codes to shopper-facing copy, following the phrasing
 * recommended in Airwallex's issuer-response-codes documentation.
 * Two code families can surface:
 *  - numeric issuer response codes (from the payment attempt), e.g. "51"
 *  - Airwallex.js element/API error codes, e.g. "insufficient_available_funds"
 */
const ISSUER_CODE_MESSAGES: Record<string, string> = {
  "01": "This card's issuer needs you to contact them, or you can try a different card.",
  "05": "This card was declined by its issuer. Try a different card.",
  "14": "That card number doesn't look right. Check it and try again.",
  "41": "This card was reported lost. Please use a different card.",
  "43": "This card was reported stolen. Please use a different card.",
  "51": "This card has insufficient funds. Try a smaller amount on this card or use a different one.",
  "54": "This card has expired. Check the expiry date or use a different card.",
  "59": "This payment was flagged by the card issuer. Try a different card.",
  "61": "This payment exceeds the card's limit. Try a smaller amount on this card.",
  "91": "The card issuer is temporarily unavailable. Wait a moment and try again.",
  "96": "The card issuer had a technical problem. Wait a moment and try again.",
};

const SDK_CODE_MESSAGES: Record<string, string> = {
  insufficient_available_funds:
    "This card has insufficient funds. Try a smaller amount on this card or use a different one.",
  processor_declined: "This card was declined. Try a different card.",
  issuer_declined: "This card was declined by its issuer. Try a different card.",
  risk_declined: "This payment couldn't be accepted. Please use a different card.",
  processor_unavailable: "The payment network is temporarily unavailable. Wait a moment and try again.",
  processor_busy: "The payment network is busy. Wait a moment and try again.",
  expired: "This payment session expired. Refresh and try again.",
  invalid_card: "That card number doesn't look right. Check it and try again.",
  validation_error: "Some card details look incomplete. Check them and try again.",
};

const FALLBACK = "This card couldn't be authorized. Try a different card.";

export function friendlyDeclineMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return ISSUER_CODE_MESSAGES[code] ?? SDK_CODE_MESSAGES[code] ?? FALLBACK;
}
