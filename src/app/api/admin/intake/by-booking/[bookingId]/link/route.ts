import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  isActiveAdmin,
} from "@/lib/admin/is-active-admin";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

import {
  hashIntakeToken,
  isValidIntakeToken,
} from "@/lib/intake/intake-access";

import {
  decryptIntakeToken,
} from "@/lib/intake/intake-token-crypto";
import { googleErrorLogMetadata } from "@/lib/google/safe-error";

type Props = {
  params: Promise<{
    bookingId: string;
  }>;
};

export async function GET(
  request: NextRequest,
  {
    params,
  }: Props,
) {
  const allowed =
    await isActiveAdmin();

  if (!allowed) {
    return NextResponse.json(
      {
        error:
          "No autorizado.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const {
      bookingId,
    } = await params;

    const supabase =
      getSupabaseAdmin();

    /* =====================================================
       BOOKING
    ===================================================== */

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
          payment_status,
          service_name_snapshot
        `,
      )
      .eq(
        "id",
        bookingId,
      )
      .maybeSingle();

    if (
      bookingError ||
      !booking
    ) {
      return NextResponse.json(
        {
          error:
            "Reserva no encontrada.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      booking
        .payment_status !==
      "paid"
    ) {
      return NextResponse.json(
        {
          error:
            "La reserva todavía no está pagada.",
        },
        {
          status: 409,
        },
      );
    }

    /* =====================================================
       FORMULARIO
    ===================================================== */

    const {
      data: form,
      error:
        formError,
    } = await supabase
      .from(
        "booking_intake_forms",
      )
      .select(
        `
          id,
          booking_id,
          access_token_hash,
          access_token_encrypted,
          submitted_at,
          current_step
        `,
      )
      .eq(
        "booking_id",
        bookingId,
      )
      .maybeSingle();

    if (
      formError ||
      !form
    ) {
      console.error(
        "Intake form read error:",
        googleErrorLogMetadata(formError),
      );

      return NextResponse.json(
        {
          error:
            "Esta reserva no tiene formulario asociado.",
        },
        {
          status: 404,
        },
      );
    }

    // Read-only: missing or inconsistent access requires explicit review.
    if (!form.access_token_hash || !form.access_token_encrypted) {
      return NextResponse.json(
        {
          error: "El formulario no tiene datos de acceso completos. Se requiere revisión administrativa; no se generó un token nuevo.",
        },
        { status: 409 },
      );
    }

    let token: string;
    try {
      token = decryptIntakeToken(form.access_token_encrypted);
      if (
        !isValidIntakeToken(token) ||
        hashIntakeToken(token) !== form.access_token_hash
      ) {
        throw new Error("Intake token hash mismatch");
      }
    } catch {
      return NextResponse.json(
        {
          error: "Error de integridad del acceso al formulario. Se requiere revisión administrativa; el token no fue modificado.",
        },
        { status: 409 },
      );
    }

    /* =====================================================
       URL
    ===================================================== */

    const origin =
      new URL(
        request.url,
      ).origin;

    const formUrl =
      new URL(
        `/formulario/${token}`,
        origin,
      ).toString();

    return NextResponse.json({
      success: true,

      formUrl,

      submitted:
        Boolean(
          form
            .submitted_at,
        ),

      currentStep:
        form
          .current_step ??
        1,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "Admin intake link error:",
      googleErrorLogMetadata(error),
    );

    return NextResponse.json(
      {
        error:
          "No fue posible recuperar el formulario.",
      },
      {
        status: 500,
      },
    );
  }
}
