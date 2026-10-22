import "server-only";

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
      formError,
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
          payment_status
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
        bookingError,
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

  return {
    form,
    booking,
  };
}