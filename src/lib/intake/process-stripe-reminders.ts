import "server-only";
import { getStripeBookingAdmin, getStripeTestSiteUrl } from "@/lib/stripe/server";
import { storedIntakeUrl } from "@/lib/intake/stored-intake-url";
import { sendIntakeFormReadyEmail } from "@/lib/email/send-intake-form-ready-email";

export async function processStripeIntakeReminders() {
  const db = getStripeBookingAdmin();
  let sent = 0;
  for (let i = 0; i < 10; i++) {
    const claim = await db.rpc("claim_stripe_intake_reminder_v1", {});
    if (claim.error) throw new Error("intake_reminder_claim_failed");
    const form = claim.data;
    if (!form) break;

    // Construct the stable payload without any external I/O. A token integrity
    // error is terminal for automation; it must not invent replacement access.
    let payload: Parameters<typeof sendIntakeFormReadyEmail>[0];
    try {
      payload = {
        formId: form.form_id, customerName: form.customer_name, customerEmail: form.customer_email,
        serviceName: form.service_name, formUrl: storedIntakeUrl(form, getStripeTestSiteUrl()),
      };
    } catch {
      const saved = await db.from("booking_intake_forms")
        .update({ ready_email_error: "reminder_pre_dispatch_requires_review" })
        .eq("id", form.form_id).eq("ready_email_error", "reminder_claimed_not_started")
        .is("ready_email_sent_at", null);
      if (saved.error) throw new Error("intake_reminder_storage_requires_review");
      continue;
    }

    // PostgreSQL revalidates and locks both rows, including the exact observed
    // starts_at, and records potential dispatch BEFORE any Resend call.
    const dispatch = await db.rpc("mark_stripe_intake_reminder_dispatch_started_v1", {
      p_booking_id: form.booking_id, p_form_id: form.form_id,
      p_claim_started_at: form.claim_started_at, p_expected_starts_at: form.expected_starts_at,
    });
    if (dispatch.error || typeof dispatch.data !== "boolean") {
      // A response may have been lost after COMMIT. Do not release, overwrite
      // the durable phase, or contact Resend without a confirmed true result.
      throw new Error("intake_reminder_dispatch_requires_review");
    }
    if (!dispatch.data) {
      const released = await db.rpc("release_unstarted_stripe_intake_reminder_v1", {
        p_booking_id: form.booking_id, p_claim_started_at: form.claim_started_at,
      });
      if (released.error) throw new Error("intake_reminder_release_requires_review");
      // If another dispatcher won, release itself rejects the later phase.
      continue;
    }

    let emailId: string | null = null;
    let code: string | null = null;
    try {
      const result = await sendIntakeFormReadyEmail(payload);
      if (result.error || !result.data?.id) {
        const status = result.error?.statusCode;
        code = typeof status === "number" && status >= 400 && status < 500 &&
          ![408, 409, 425, 429].includes(status)
          ? "reminder_delivery_rejected" : "reminder_delivery_requires_review";
      } else {
        emailId = result.data.id;
        sent++;
      }
    } catch {
      code = "reminder_delivery_requires_review";
    }
    // One external attempt only. Success, deterministic rejection, lost response
    // and storage failure all retain the claim. None may release or redispatch.
    const saved = await db.from("booking_intake_forms").update(emailId ? {
      ready_email_id: emailId, ready_email_sent_at: new Date().toISOString(), ready_email_error: null,
    } : { ready_email_error: code }).eq("id", form.form_id)
      .eq("ready_email_error", "reminder_delivery_pending_or_unknown").is("ready_email_sent_at", null);
    if (saved.error) throw new Error("intake_reminder_storage_requires_review");
  }
  return { sent };
}
