import "server-only";
import { randomUUID } from "node:crypto";
import { getStripeBookingAdmin, getStripeConfig } from "@/lib/stripe/server";
import { deleteGoogleCalendarEvent, updateGoogleCalendarEvent } from "@/lib/google/calendar";
import { googleErrorLogMetadata } from "@/lib/google/safe-error";
import { sendBookingEmails } from "@/lib/email/send-booking-emails";

/** Called only after server-side active-admin authorization. The RPC checks the
 * original receipt and reserves one durable operation; no refund or additional
 * package entitlement is created by a cancellation. */
export async function requestStripeBookingChange(bookingId: string, kind: "rescheduled" | "cancelled", startsAt: string | null, adminUserId?: string) {
  const config = getStripeConfig();
  const db = getStripeBookingAdmin();
  const result = await db.rpc("request_stripe_booking_change_v1", {
    p_booking_id: bookingId, p_change_kind: kind, p_starts_at: startsAt, p_request_id: randomUUID(),
    p_stripe_mode: config.mode, p_stripe_account_id: config.accountId,
    ...(adminUserId ? { p_admin_user_id: adminUserId } : {}),
  });
  if (result.error) throw new Error("booking_change_not_available");
  if (result.data?.review_pending) return { ok: true, bookingId, status: result.data.status,
    changeCompleted: false, emailWarning: "La cancelación quedó pendiente de revisión. No se ha consumido ni repuesto la sesión." };
  if (!result.data?.job_id) throw new Error("booking_change_not_available");
  let processed = { completed: result.data.status === "completed" };
  if (!processed.completed) {
    try { processed = await processStripeBookingChange(result.data.job_id); }
    catch { console.error("Saved Stripe booking change remains queued", { jobId: result.data.job_id }); }
  }
  return { ok: true, bookingId, status: kind === "cancelled" ? "cancelled" : "confirmed",
    changeJobId: result.data.job_id, changeCompleted: processed.completed || result.data.status === "completed",
    emailWarning: processed.completed || result.data.status === "completed" ? null
      : "El cambio quedó guardado. La actualización del calendario y el correo siguen en preparación." };
}

export async function processStripeBookingChange(jobId: string | null = null) {
  const config = getStripeConfig();
  const db = getStripeBookingAdmin();
  const owner = randomUUID();
  const claim = await db.rpc("claim_stripe_booking_change_v1", {
    p_job_id: jobId, p_owner: owner, p_stripe_mode: config.mode, p_stripe_account_id: config.accountId,
  });
  if (claim.error) throw new Error("booking_change_claim_failed");
  if (!claim.data?.claimed) return { completed: false, skipped: true };
  let job = claim.data.job;
  const save = async (action: string, payload = {}) => {
    const result = await db.rpc("save_stripe_booking_change_v1", {
      p_job_id: job.id, p_owner: owner, p_action: action, p_payload: payload,
    });
    if (result.error || !result.data) throw new Error("booking_change_storage_failed");
    job = result.data;
  };
  try {
    const booking = job.booking_snapshot;
    if (!booking || !booking.google_event_id || job.stripe_mode !== config.mode || job.stripe_account_id !== config.accountId) {
      throw new Error("booking_change_review_required");
    }
    await save("heartbeat");
    if (!job.calendar_completed_at) {
      if (job.change_kind === "rescheduled") {
        await updateGoogleCalendarEvent({ eventId: booking.google_event_id, startsAt: booking.starts_at, endsAt: booking.ends_at });
      } else {
        try { await deleteGoogleCalendarEvent(booking.google_event_id); }
        catch (error) { if (![404, 410].includes(googleErrorLogMetadata(error).status ?? 0)) throw error; }
      }
      await save("calendar_completed");
    }
    if (!job.email_id) {
      if (job.email_started_at && Date.parse(job.email_started_at) <= Date.now() - 23 * 60 * 60_000) {
        throw new Error("booking_change_email_review_required");
      }
      await save("email_started");
      const result = await sendBookingEmails({
        recipients: ["customer"], bookingId: booking.id, bookingReference: booking.booking_reference,
        notice: job.change_kind, changeRevision: job.id,
        customerName: booking.customer_name, customerEmail: booking.customer_email, customerPhone: booking.customer_phone,
        serviceName: booking.service_name_snapshot, startsAt: booking.starts_at,
        durationMinutes: booking.duration_minutes_snapshot, sessionCount: booking.session_count_snapshot ?? 1,
        price: booking.price_snapshot, currency: booking.currency_snapshot, notes: booking.notes,
        meetUrl: job.change_kind === "cancelled" ? null : booking.google_meet_url, calendarUrl: null,
        ...(booking.process_id && (booking.package_session_number > 1 || booking.replaces_booking_id) ? { priceTextOverride: "Incluido en tu proceso" } : {}),
      });
      if (result.customer.error || !result.customer.id) throw new Error("booking_change_email_failed");
      await save("email_sent", { id: result.customer.id });
    }
    await save("completed");
    return { completed: true, skipped: false };
  } catch (error) {
    const review = error instanceof Error && error.message.endsWith("review_required");
    console.error("Stripe booking change deferred", { jobId: job.id, review });
    try { await save(review ? "review_required" : "retryable"); } catch { /* Lease timeout permits safe recovery. */ }
    return { completed: false, skipped: false };
  }
}
