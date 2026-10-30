import { LEGAL_TERMS_VERSION, PRIVACY_NOTICE_VERSION } from "./documents";

// The server validates this declaration and persists it through the legal RPCs.
// Never substitute logs/browser storage for the stored evidence.
export const currentBookingAcceptance = {
  termsAccepted: true,
  ageConfirmed: true,
  termsVersion: LEGAL_TERMS_VERSION,
  privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
} as const;

export function hasCurrentBookingAcceptance(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const accepted = value as Record<string, unknown>;
  return Object.keys(accepted).length === 4 &&
    accepted.termsAccepted === true &&
    accepted.ageConfirmed === true &&
    accepted.termsVersion === LEGAL_TERMS_VERSION &&
    accepted.privacyNoticeVersion === PRIVACY_NOTICE_VERSION;
}

// Read only from an authorized booking obtained by the server. A declaration
// sent by the browser is not durable evidence and cannot satisfy this check.
export function hasDurableCurrentBookingAcceptance(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const booking = value as Record<string, unknown>;
  const hasTimestamp = (timestamp: unknown) =>
    typeof timestamp === "string" && timestamp.trim() !== "" && Number.isFinite(Date.parse(timestamp));
  return hasTimestamp(booking.legal_terms_accepted_at) &&
    hasTimestamp(booking.legal_adult_confirmed_at) &&
    booking.legal_terms_version === LEGAL_TERMS_VERSION &&
    booking.legal_privacy_notice_version === PRIVACY_NOTICE_VERSION;
}
