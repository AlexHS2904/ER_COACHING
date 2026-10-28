import "server-only";

import {
  decryptIntakeToken,
  encryptIntakeToken,
} from "@/lib/intake/intake-token-crypto";
import {
  createIntakeAccess,
  hashIntakeToken,
  isValidIntakeToken,
} from "@/lib/intake/intake-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendIntakeFormReadyEmail } from "@/lib/email/send-intake-form-ready-email";

type Params = {
  bookingId: string;
  provider: "manual" | "stripe";
  paymentReference?: string | null;
  siteUrl: string;
};

type Activation = {
  form_id: string;
  customer_name: string;
  customer_email: string;
  service_name: string;
  access_token_hash: string | null;
  access_token_encrypted: string | null;
  intake_created: boolean;
  payment_already_paid: boolean;
  ready_email_sent_at: string | null;
};

export async function activateBookingIntake({
  bookingId,
  provider,
  paymentReference = null,
  siteUrl,
}: Params) {
  const supabase = getSupabaseAdmin();
  const candidate = createIntakeAccess();

  // PostgreSQL chooses the winning access under the booking lock. A retry's
  // candidate is discarded; always use the access returned by the RPC.
  const { data, error } = await supabase.rpc("activate_booking_intake_v2", {
    p_booking_id: bookingId,
    p_access_token_hash: candidate.tokenHash,
    p_access_token_encrypted: encryptIntakeToken(candidate.token),
    p_payment_provider: provider,
    p_payment_reference: paymentReference,
  });

  if (error) {
    console.error("activate_booking_intake_v2 error:", error);
    throw new Error("No fue posible activar el formulario.");
  }

  const activation = (data as Activation[] | null)?.[0];
  if (!activation?.form_id) {
    throw new Error("La activación no devolvió un formulario válido.");
  }

  let token: string;
  try {
    if (!activation.access_token_hash || !activation.access_token_encrypted) {
      throw new Error("Missing stored intake access");
    }
    token = decryptIntakeToken(activation.access_token_encrypted);
    if (
      !isValidIntakeToken(token) ||
      hashIntakeToken(token) !== activation.access_token_hash
    ) {
      throw new Error("Intake token hash mismatch");
    }
  } catch {
    throw new Error(
      "Error de integridad del acceso al formulario. Se requiere revisión administrativa; no se generó un acceso de reemplazo.",
    );
  }

  const formUrl = new URL(`/formulario/${token}`, siteUrl).toString();
  let emailSent = Boolean(activation.ready_email_sent_at);

  if (!emailSent) {
    // Email delivery is outside the payment/intake transaction. Resend's stable
    // key deduplicates concurrent sends; persisted success skips future retries.
    let emailId: string | null = null;
    let emailErrorMessage: string | null = null;

    try {
      const result = await sendIntakeFormReadyEmail({
        formId: activation.form_id,
        customerName: activation.customer_name,
        customerEmail: activation.customer_email,
        serviceName: activation.service_name,
        formUrl,
      });

      if (result.error || !result.data?.id) {
        throw new Error(result.error?.message ?? "Resend no devolvió un ID de correo.");
      }

      emailId = result.data.id;
      emailSent = true;
    } catch (emailError) {
      emailErrorMessage = emailError instanceof Error
        ? emailError.message
        : "No fue posible enviar el correo del formulario.";
      console.error("Intake ready email failed for form:", activation.form_id);
    }

    // A status-storage failure must not be mistaken for an email-send failure.
    try {
      const { error: saveError } = await supabase
        .from("booking_intake_forms")
        .update(emailSent ? {
          ready_email_id: emailId,
          ready_email_sent_at: new Date().toISOString(),
          ready_email_error: null,
        } : {
          ready_email_error: emailErrorMessage,
        })
        .eq("id", activation.form_id)
        // A failed concurrent attempt must not overwrite recorded success.
        .is("ready_email_sent_at", null);

      if (saveError) {
        console.error("Intake ready email status save failed:", saveError);
      }
    } catch {
      console.error("Could not record intake ready email status for form:", activation.form_id);
    }
  }

  return {
    success: true,
    formId: activation.form_id,
    formUrl,
    emailSent,
    intakeCreated: activation.intake_created,
    paymentAlreadyPaid: activation.payment_already_paid,
  };
}
