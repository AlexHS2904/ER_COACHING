import "server-only";
import { getStripeBookingAdmin } from "@/lib/stripe/server";
import { expireDueStripeHolds } from "@/lib/stripe/expire-hold";
import { finalizePaidBooking } from "@/lib/bookings/finalize-paid-booking";
import { processStripeIntakeReminders } from "@/lib/intake/process-stripe-reminders";

export async function processPendingStripeBookings() {
  await expireDueStripeHolds();
  const db = getStripeBookingAdmin();
  const { data, error } = await db.from("bookings").select("id")
    .eq("payment_flow", "stripe").eq("payment_status", "paid")
    .in("status", ["pending", "confirmed"])
    .in("finalization_status", ["pending", "retryable", "processing"])
    .lte("next_finalization_at", new Date().toISOString()).limit(10);
  if (error) throw new Error("pending_stripe_work_unavailable");
  for (const booking of data ?? []) await finalizePaidBooking(booking.id);
  const reminders = await processStripeIntakeReminders();
  return { processed: data?.length ?? 0, remindersSent: reminders.sent };
}
