/** Decisions are made from trusted database records; client payment claims are ignored. */
export type ProcessPurchase = {
  id: string;
  process_id: string | null;
  package_session_number: number | null;
  payment_status: string;
  payment_provider: string | null;
  payment_flow: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  stripe_mode: string | null;
  stripe_account_id: string | null;
};

export type PaidProcess = {
  id: string;
  status: string;
  purchase_booking_id: string | null;
  total_sessions: number;
  stripe_mode: string | null;
  stripe_account_id: string | null;
};

export function hasVerifiedProcessPurchase(process: PaidProcess, purchase: ProcessPurchase | null) {
  return Boolean(purchase && ["active", "completed"].includes(process.status) &&
    process.total_sessions === 6 && process.purchase_booking_id === purchase.id &&
    purchase.process_id === process.id && purchase.package_session_number === 1 &&
    ["test", "live"].includes(process.stripe_mode ?? "") && process.stripe_account_id &&
    purchase.stripe_mode === process.stripe_mode && purchase.stripe_account_id === process.stripe_account_id &&
    purchase.payment_flow === "stripe" && purchase.payment_status === "paid" &&
    purchase.payment_provider === "stripe" && purchase.payment_reference && purchase.paid_at);
}

/** Pending decisions reserve their ordinal. Only an approved, unused
 * replacement can reuse it; a successor permanently closes that approval. */
export function nextProcessSessionNumber(total: number, bookings: {
  id?: string; package_session_number: number | null; session_resolution?: string | null; replaces_booking_id?: string | null;
}[]) {
  const replacement = bookings.find(b => b.session_resolution === "replacement_approved" && b.id &&
    !bookings.some(successor => successor.replaces_booking_id === b.id));
  if (replacement) return replacement.package_session_number;
  const used = bookings.reduce((max, booking) => Math.max(max, booking.package_session_number ?? 0), 0);
  return used < total ? used + 1 : null;
}

export function isProcessWithinValidity(expiresAt: string | null | undefined, now = Date.now()) {
  // NULL denotes a historical contract: never impose the new deadline on it.
  return expiresAt == null || (Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) > now);
}
