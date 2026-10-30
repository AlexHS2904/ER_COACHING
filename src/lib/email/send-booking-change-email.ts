import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendBookingEmails } from "@/lib/email/send-booking-emails";

// Send only after the business change was saved. Email failure never rolls it
// back; record a safe diagnostic and return a warning to the admin caller.
export async function sendBookingChangeEmail(bookingId: string, notice: "rescheduled" | "cancelled") {
  const db = getSupabaseAdmin();
  try {
    const { data: b, error } = await db.from("bookings")
      .select("id,booking_reference,customer_name,customer_email,customer_phone,service_name_snapshot,starts_at,duration_minutes_snapshot,session_count_snapshot,price_snapshot,currency_snapshot,notes,google_meet_url,updated_at")
      .eq("id", bookingId).maybeSingle();
    if (error || !b) throw new Error("booking_change_unavailable");
    const result = await sendBookingEmails({
      recipients: ["customer"], bookingId, notice, changeRevision: b.updated_at,
      bookingReference: b.booking_reference, customerName: b.customer_name, customerEmail: b.customer_email,
      customerPhone: b.customer_phone, serviceName: b.service_name_snapshot, startsAt: b.starts_at,
      durationMinutes: b.duration_minutes_snapshot, sessionCount: b.session_count_snapshot ?? 1,
      price: b.price_snapshot, currency: b.currency_snapshot, notes: b.notes,
      meetUrl: notice === "cancelled" ? null : b.google_meet_url, calendarUrl: null,
    });
    if (result.customer.error || !result.customer.id) throw new Error("booking_change_email_failed");
    return null;
  } catch {
    console.error("Booking change email requires review", { bookingId, notice });
    try {
      await db.from("bookings").update({ integration_error: "booking_change_email_requires_review" }).eq("id", bookingId);
    } catch { /* The successful business change must still be returned. */ }
    return "El cambio quedó guardado, pero el correo al cliente requiere revisión.";
  }
}
