import "server-only";
import { googleErrorLogMetadata } from "@/lib/google/safe-error";
import { hasVerifiedProcessPurchase } from "@/lib/coaching/process-entitlement";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

import {
  hashIntakeToken,
  isValidIntakeToken,
} from "@/lib/intake/intake-access";

export async function getIntakeByToken(
  token: string,
) {
  /* =====================================================
     1. VALIDAR TOKEN
  ===================================================== */

  if (
    !isValidIntakeToken(
      token,
    )
  ) {
    return null;
  }

  const supabase =
    getSupabaseAdmin();

  const tokenHash =
    hashIntakeToken(
      token,
    );

  /* =====================================================
     2. BUSCAR FORMULARIO
  ===================================================== */

  const {
    data: form,
    error:
      formError,
  } = await supabase
    .from(
      "booking_intake_forms",
    )
    .select("*")
    .eq(
      "access_token_hash",
      tokenHash,
    )
    .maybeSingle();

  if (formError) {
    console.error(
      "getIntakeByToken form error:",
      googleErrorLogMetadata(formError),
    );

    return null;
  }

  if (!form) {
    console.error(
      "getIntakeByToken: token hash not found",
    );

    return null;
  }

  /* =====================================================
     3. BOOKING OPCIONAL

     Invitación manual:
       booking_id = null

     Sesión 1:1:
       booking_id = uuid
  ===================================================== */

  let booking:
    | {
        id: string;
        booking_reference:
          string;
        customer_name:
          string;
        customer_email:
          string;
        service_name_snapshot:
          string;
        starts_at:
          string;
        status:
          string;
        payment_status:
          string;
        process_id: string | null;
        package_session_number: number | null;
        payment_flow: string | null;
        payment_provider: string | null;
        payment_reference: string | null;
        paid_at: string | null;
        stripe_mode: string | null;
        stripe_account_id: string | null;
      }
    | null =
    null;

  if (
    form.booking_id
  ) {
    const {
      data:
        bookingData,
      error:
        bookingError,
    } = await supabase
      .from(
        "bookings",
      )
      .select(
        `
          id,
          booking_reference,
          customer_name,
          customer_email,
          service_name_snapshot,
          starts_at,
          status,
          payment_status,
          process_id, package_session_number, payment_flow, payment_provider, payment_reference, paid_at,
          stripe_mode, stripe_account_id
        `,
      )
      .eq(
        "id",
        form.booking_id,
      )
      .maybeSingle();

    if (
      bookingError
    ) {
      console.error(
        "getIntakeByToken booking error:",
        googleErrorLogMetadata(bookingError),
      );

      return null;
    }

    if (
      !bookingData
    ) {
      console.error(
        "getIntakeByToken: booking not found",
      );

      return null;
    }

    booking =
      bookingData;
  }

  /* =====================================================
     4. RESULTADO

     booking puede ser null y eso ES correcto
     para invitaciones manuales.
  ===================================================== */

  let processEntitlementActive = false;
  if (form.process_id && booking) {
    const process = await supabase.from("coaching_processes")
      .select("id,status,purchase_booking_id,total_sessions,stripe_mode,stripe_account_id")
      .eq("id", form.process_id).maybeSingle();
    processEntitlementActive = !process.error && process.data !== null &&
      process.data.purchase_booking_id === booking.id && hasVerifiedProcessPurchase(process.data, booking);
  }
  return {
    form,
    booking,
    processEntitlementActive,
  };
}
