const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Fast recovery for transient failures, then fewer Stripe/DB calls. Using age
// rather than an in-memory retry counter makes restarts deterministic.
export const RECONCILIATION_REVIEW_AFTER_MS = 24 * HOUR;
export const RECONCILIATION_BANDS = [
  { ageUntil: 5 * MINUTE, interval: 30_000 },
  { ageUntil: 30 * MINUTE, interval: 2 * MINUTE },
  { ageUntil: 2 * HOUR, interval: 10 * MINUTE },
  { ageUntil: Infinity, interval: HOUR },
] as const;

export function expirationReconciliationPolicy(
  expiresAt: string,
  lastAttemptAt: string | null,
  now = Date.now(),
) {
  const expires = Date.parse(expiresAt);
  const age = now - expires;
  const interval = RECONCILIATION_BANDS.find(band => age < band.ageUntil)?.interval ?? HOUR;
  const last = lastAttemptAt === null ? null : Date.parse(lastAttemptAt);
  return {
    due: Number.isFinite(expires) && age >= 0 &&
      (last === null || (Number.isFinite(last) && now - last >= interval)),
    reviewDue: Number.isFinite(expires) && age >= RECONCILIATION_REVIEW_AFTER_MS,
    interval,
  };
}

// The same age bands are sent to PostgREST, BEFORE its batch limit. Rows in
// backoff cannot occupy every slot and starve newly overdue bookings.
export function expirationReconciliationFilter(now = Date.now()) {
  const iso = (time: number) => new Date(time).toISOString();
  let previousAge = 0;
  const clauses = ["stripe_expiration_last_attempt_at.is.null"];
  for (const band of RECONCILIATION_BANDS) {
    const parts = [`stripe_expiration_last_attempt_at.lte.${iso(now - band.interval)}`];
    if (previousAge > 0) parts.push(`payment_expires_at.lte.${iso(now - previousAge)}`);
    if (Number.isFinite(band.ageUntil)) parts.push(`payment_expires_at.gt.${iso(now - band.ageUntil)}`);
    clauses.push(`and(${parts.join(",")})`);
    previousAge = band.ageUntil;
  }
  return clauses.join(",");
}
