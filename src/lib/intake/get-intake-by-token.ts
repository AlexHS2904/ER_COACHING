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

  if (
    formError ||
    !form
  ) {
    return null;
  }

  const {
    data: booking,
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
    bookingError ||
    !booking
  ) {
    return null;
  }

  return {
    form,
    booking,
  };
}