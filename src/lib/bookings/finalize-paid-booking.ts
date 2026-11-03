import "server-only";
import { randomUUID } from "node:crypto";
import { assertStripeRecordScope, getStripeBookingAdmin, getStripeConfig, type StripeRuntimeScope } from "@/lib/stripe/server";
import { ensurePaidBookingCalendar } from "@/lib/google/calendar";
import { sendBookingEmails } from "@/lib/email/send-booking-emails";
import { activateBookingIntake } from "@/lib/intake/activate-booking-intake";
import { googleErrorLogMetadata } from "@/lib/google/safe-error";
import { recoverProcessAccessUrl } from "@/lib/coaching/process-access";

export async function finalizePaidBooking(bookingId: string, expectedScope?: StripeRuntimeScope) {
  const config = getStripeConfig();
  if (expectedScope && (expectedScope.mode !== config.mode || expectedScope.accountId !== config.accountId)) {
    throw new Error("finalization_scope_mismatch");
  }
  const scope = { p_stripe_mode: config.mode, p_stripe_account_id: config.accountId };
  const db = getStripeBookingAdmin();
  const owner = randomUUID();
  const claim = await db.rpc("claim_stripe_finalization_v2", { p_booking_id: bookingId, p_owner: owner, ...scope });
  if (claim.error) throw new Error("finalization_claim_failed");
  if (!claim.data) return { completed: false, skipped: true };
  let booking = claim.data;
  assertStripeRecordScope(booking, config);
  let step = "calendar";
  const save = async (name: string, data = {}) => {
    const result = await db.rpc("save_stripe_finalization_v2", {
      p_booking_id: bookingId, p_owner: owner, p_step: name, p_data: data, ...scope,
    });
    if (result.error) throw new Error("finalization_lease_or_storage_failed");
    booking = result.data;
  };
  const checkUncertainEmail = (started: string | null, sent: boolean) => {
    // Resend retains keys for 24h. Beyond that window, do not risk a duplicate
    // after an accepted send whose result was lost. Explicit review is required.
    if (!sent && started && Date.parse(started) < Date.now() - 23 * 60 * 60 * 1000) {
      throw new Error("email_review_required");
    }
  };
  try {
    await save("heartbeat");
    let processAccessUrl: string | undefined;
    if (booking.process_id) {
      const process = await db.from("coaching_processes")
        .select("id,status,total_sessions,purchase_booking_id,stripe_mode,stripe_account_id,access_token_hash,access_token_encrypted")
        .eq("id", booking.process_id).maybeSingle();
      if (process.error || !process.data || !["active", "completed"].includes(process.data.status) ||
          process.data.total_sessions !== booking.session_count_snapshot) throw new Error("process_entitlement_review_required");
      assertStripeRecordScope(process.data, { mode: config.mode, accountId: config.accountId });
      processAccessUrl = recoverProcessAccessUrl(process.data, booking.stripe_site_origin);
    }
    const calendar = await ensurePaidBookingCalendar({
      bookingId, existingEventId: booking.google_event_id,
      bookingReference: booking.booking_reference, serviceName: booking.service_name_snapshot,
      customerName: booking.customer_name, customerEmail: booking.customer_email,
      startsAt: booking.starts_at, endsAt: booking.ends_at, notes: booking.notes,
    });
    await save("calendar", calendar);
    if (!calendar.eventId || !calendar.meetUrl) throw new Error("meet_pending");

    step = "intake";
    const intake = await activateBookingIntake({
      bookingId, provider: "stripe", paymentReference: booking.payment_reference,
      siteUrl: booking.stripe_site_origin, sendReadyEmail: false,
      stripeScope: config, processId: booking.process_id,
      allowUnavailableProcessIntake: Boolean(booking.process_id && (booking.package_session_number > 1 || booking.replaces_booking_id)),
    });
    if (!intake.canonicalIntakeUrl && !booking.customer_email_id && booking.stripe_customer_email_started_at) {
      // Missing recovery material must never remove a CTA from an ambiguous
      // delivery already associated with this idempotency key.
      throw new Error("customer_email_review_required");
    }

    for (const recipient of ["customer", "coach"] as const) {
      step = `${recipient}_email`;
      if (booking[`${recipient}_email_id`]) continue;
      checkUncertainEmail(booking[`stripe_${recipient}_email_started_at`], false);
      await save(`${recipient}_email_start`);
      const result = await sendBookingEmails({
        recipients: [recipient], bookingId, bookingReference: booking.booking_reference,
        customerName: booking.customer_name, customerEmail: booking.customer_email,
        customerPhone: booking.customer_phone,
        serviceName: booking.process_id
          ? `${booking.service_name_snapshot} · Sesión ${booking.package_session_number} de ${booking.session_count_snapshot}`
          : booking.service_name_snapshot,
        startsAt: booking.starts_at, durationMinutes: booking.duration_minutes_snapshot,
        sessionCount: booking.session_count_snapshot ?? 1, price: booking.price_snapshot,
        currency: booking.currency_snapshot, notes: booking.notes,
        meetUrl: booking.google_meet_url, calendarUrl: booking.google_calendar_url,
        canonicalIntakeUrl: intake.canonicalIntakeUrl,
        processAccessUrl,
        ...(booking.process_id && (booking.package_session_number > 1 || booking.replaces_booking_id)
          ? { priceTextOverride: "Incluido en tu proceso" } : {}),
      });
      if (result[recipient].error || !result[recipient].id) throw new Error("booking_email_failed");
      await save(`${recipient}_email`, { id: result[recipient].id });
    }

    step = "completion";
    await save("completed");
    return { completed: true, skipped: false };
  } catch (error) {
    const review = error instanceof Error &&
      (error.message.endsWith("review_required") || error.message.includes("integridad") ||
        error.message.includes("revisión administrativa"));
    const code = review ? `${step}_review_required` : `${step}_retryable`;
    console.error("Stripe booking finalization deferred", { bookingId, step, code,
      ...(step === "calendar" ? { google: googleErrorLogMetadata(error, { providerReason: true }) } : {}),
    });
    try { await save(review ? "review_required" : "retryable", { code }); } catch {
      // The lease may have been reclaimed. Its durable timeout permits recovery.
      console.error("Stripe finalization status requires recovery", { bookingId, step });
    }
    return { completed: false, skipped: false };
  }
}
