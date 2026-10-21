import "server-only";

import {
  encryptIntakeToken,
} from "@/lib/intake/intake-token-crypto";

import {
  createIntakeAccess,
} from "@/lib/intake/intake-access";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

import {
  sendIntakeFormReadyEmail,
} from "@/lib/email/send-intake-form-ready-email";

type Params = {
  bookingId: string;
  provider:
    | "manual"
    | "stripe";
  paymentReference?:
    | string
    | null;
  siteUrl: string;
};

export async function activateBookingIntake({
  bookingId,
  provider,
  paymentReference =
    null,
  siteUrl,
}: Params) {
  const supabase =
    getSupabaseAdmin();

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
        session_count_snapshot,
        payment_status,
        status,
        starts_at
      `,
    )
    .eq(
      "id",
      bookingId,
    )
    .single();

  if (
    bookingError ||
    !booking
  ) {
    throw new Error(
      "Reserva no encontrada.",
    );
  }

  if (
    booking
      .service_name_snapshot !==
      "Sesión 1:1" ||
    (
      booking
        .session_count_snapshot ??
      1
    ) !== 1
  ) {
    throw new Error(
      "El formulario previo solo aplica a sesiones 1:1.",
    );
  }

  if (
    booking.status ===
    "cancelled"
  ) {
    throw new Error(
      "No puedes registrar el pago de una reserva cancelada.",
    );
  }

  if (
    booking
      .payment_status ===
    "paid"
  ) {
    throw new Error(
      "Esta reserva ya está marcada como pagada.",
    );
  }

  const {
    token,
    tokenHash,
  } =
    createIntakeAccess();

    const encryptedToken =
    encryptIntakeToken(
        token,
    );

  const {
    data,
    error,
  } = await supabase
    .rpc(
      "activate_booking_intake",
      {
        p_booking_id:
          bookingId,

        p_access_token_hash:
          tokenHash,

        p_payment_provider:
          provider,

        p_payment_reference:
          paymentReference,
      },
    );

    const {
  error:
    tokenSaveError,
} = await supabase
  .from(
    "booking_intake_forms",
  )
  .update({
    access_token_encrypted:
      encryptedToken,
  })
  .eq(
    "booking_id",
    bookingId,
  );

if (tokenSaveError) {
  console.error(
    "Error saving encrypted intake token:",
    tokenSaveError,
  );

  throw new Error(
    "El pago se registró, pero no fue posible guardar el acceso al formulario.",
  );
}

  if (error) {
    console.error(
      "activate_booking_intake error:",
      error,
    );

    throw new Error(
      "No fue posible activar el formulario.",
    );
  }

  const formUrl =
    new URL(
      `/formulario/${token}`,
      siteUrl,
    ).toString();

  let emailSent =
    false;

  try {
    const result =
      await sendIntakeFormReadyEmail(
        {
          customerName:
            booking
              .customer_name,

          customerEmail:
            booking
              .customer_email,

          serviceName:
            booking
              .service_name_snapshot,

          formUrl,
        },
      );

    emailSent =
      !result.error;
  } catch (
    emailError
  ) {
    console.error(
      "Intake email error:",
      emailError,
    );
  }

  return {
    success: true,
    formId:
      data?.[0]
        ?.form_id ??
      null,
    formUrl,
    emailSent,
  };
}