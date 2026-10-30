import "server-only";

import { encryptIntakeToken } from "@/lib/intake/intake-token-crypto";
import { storedIntakeUrl } from "@/lib/intake/stored-intake-url";
import {
  createIntakeAccess,
} from "@/lib/intake/intake-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendIntakeFormReadyEmail } from "@/lib/email/send-intake-form-ready-email";
import { googleErrorLogMetadata } from "@/lib/google/safe-error";

type Params = {
  bookingId: string;
  provider: "manual" | "stripe";
  paymentReference?: string | null;
  siteUrl: string;
  sendReadyEmail?: boolean;
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
  sendReadyEmail = true,
}: Params) {
  const supabase = getSupabaseAdmin();
  const existing = await supabase.from("booking_intake_forms")
    .select("access_token_hash,access_token_encrypted").eq("booking_id", bookingId).maybeSingle();
  if (existing.error) throw new Error("No fue posible recuperar el acceso al formulario.");
  let tokenHash = existing.data?.access_token_hash;
  let encryptedToken = existing.data?.access_token_encrypted;
  if (!tokenHash || !encryptedToken) {
    // Only a creation proposal: the locked RPC still chooses the winning row.
    // An existing row without recoverable access is never overwritten/repaired.
    const candidate = createIntakeAccess();
    tokenHash = candidate.tokenHash;
    encryptedToken = encryptIntakeToken(candidate.token);
  }

  // PostgreSQL chooses the winning access under the booking lock, including
  // concurrent first-call proposals. Always use the access returned by the RPC.
  const { data, error } = await supabase.rpc("activate_booking_intake_v2", {
    p_booking_id: bookingId,
    p_access_token_hash: tokenHash,
    p_access_token_encrypted: encryptedToken,
    p_payment_provider: provider,
    p_payment_reference: paymentReference,
  });

  if (error) {
    console.error("activate_booking_intake_v2 failed", { bookingId });
    throw new Error("No fue posible activar el formulario.");
  }

  const activation = (data as Activation[] | null)?.[0];
  if (!activation?.form_id) {
    throw new Error("La activación no devolvió un formulario válido.");
  }

  const form = await supabase.from("booking_intake_forms").select("status,submitted_at,expires_at")
    .eq("id", activation.form_id).maybeSingle();
  if (form.error || !form.data) throw new Error("No fue posible verificar el formulario.");
  const submitted = form.data.status === "submitted" && Boolean(form.data.submitted_at);
  const accessible = form.data.status === "active" && !form.data.submitted_at &&
    Date.parse(form.data.expires_at) > Date.now();
  if (!submitted && !accessible) {
    throw new Error("El formulario requiere revisión administrativa; no se generó un acceso de reemplazo.");
  }

  let canonicalIntakeUrl: string | null = null;
  try {
    // Submission changes redirect eligibility, never the identity of an email
    // already accepted by the provider. Recover the same stored token in both
    // states, including a finalization retry after an ambiguous email result.
    if (!submitted || activation.access_token_encrypted) {
      canonicalIntakeUrl = storedIntakeUrl(activation, siteUrl);
    }
  } catch {
    throw new Error(
      "Error de integridad del acceso al formulario. Se requiere revisión administrativa; no se generó un acceso de reemplazo.",
    );
  }

  let emailSent = Boolean(activation.ready_email_sent_at);

  if (sendReadyEmail && accessible && canonicalIntakeUrl && !emailSent) {
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
        formUrl: canonicalIntakeUrl,
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
        console.error("Intake ready email status save failed:", googleErrorLogMetadata(saveError));
      }
    } catch {
      console.error("Could not record intake ready email status for form:", activation.form_id);
    }
  }

  return {
    success: true,
    formId: activation.form_id,
    intakeStatus: form.data.status as "active" | "submitted",
    submittedAt: form.data.submitted_at as string | null,
    canonicalIntakeUrl,
    // Internal server result. Public callers must also validate booking access;
    // bookingIntakeDestination performs that authorization before serialization.
    redirectIntakeUrl: accessible ? canonicalIntakeUrl : null,
    emailSent,
    intakeCreated: activation.intake_created,
    paymentAlreadyPaid: activation.payment_already_paid,
  };
}
