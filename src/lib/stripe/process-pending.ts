import "server-only";
import { getStripeBookingAdmin, getStripeConfig } from "@/lib/stripe/server";
import { expireDueStripeHolds } from "@/lib/stripe/expire-hold";
import { finalizePaidBooking } from "@/lib/bookings/finalize-paid-booking";
import { processStripeIntakeReminders } from "@/lib/intake/process-stripe-reminders";
import { processStripeBookingChange } from "@/lib/bookings/stripe-booking-changes";

export async function processPendingStripeBookings(options: { budgetMs?: number; batchLimit?: number } = {}) {
  const deadline = Date.now() + Math.min(options.budgetMs ?? 75_000, 90_000);
  const limit = Math.max(1, Math.min(options.batchLimit ?? 5, 10));
  const config = getStripeConfig();
  let processed = 0, deferred = 0, remindersSent = 0, changesProcessed = 0;
  try {
    const expiration = await expireDueStripeHolds(Date.now(), { limit: 2, deadline: Math.min(deadline, Date.now() + 25_000) });
    deferred += expiration?.deferred ?? 0;
  } catch { deferred++; console.error("Stripe expiration batch remains queued"); }
  const db = getStripeBookingAdmin();
  if (Date.now() < deadline) {
    try {
      const { data, error } = await db.from("bookings").select("id")
        .eq("stripe_mode", config.mode).eq("stripe_account_id", config.accountId)
        .eq("payment_flow", "stripe").eq("payment_status", "paid")
        .in("status", ["pending", "confirmed"])
        .in("finalization_status", ["pending", "retryable", "processing"])
        .lte("next_finalization_at", new Date().toISOString()).order("next_finalization_at").limit(limit);
      if (error) throw new Error("pending_stripe_work_unavailable");
      for (const booking of data ?? []) {
        if (Date.now() >= deadline) break;
        try {
          const outcome = await finalizePaidBooking(booking.id, config);
          if (outcome.completed) processed++;
          else if (!outcome.skipped) deferred++;
        } catch { deferred++; console.error("Paid Stripe booking remains queued", { bookingId: booking.id }); }
      }
    } catch { deferred++; console.error("Stripe finalization batch remains queued"); }
  }
  if (Date.now() < deadline) {
    try { const change = await processStripeBookingChange(); if (change.completed) changesProcessed++; }
    catch { deferred++; console.error("Stripe booking change batch remains queued"); }
  }
  if (Date.now() < deadline) {
    try { remindersSent = (await processStripeIntakeReminders({ limit: 2, deadline })).sent; }
    catch { deferred++; console.error("Stripe reminder batch remains queued"); }
  }
  return { processed, deferred, remindersSent, changesProcessed, budgetExhausted: Date.now() >= deadline };
}
