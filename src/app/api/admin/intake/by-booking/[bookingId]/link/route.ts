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
  createIntakeAccess,
  hashIntakeToken,
} from "@/lib/intake/intake-access";

import {
  decryptIntakeToken,
  encryptIntakeToken,
} from "@/lib/intake/intake-token-crypto";

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
        formError,
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

    /* =====================================================
       RECUPERAR / REPARAR TOKEN

       Caso normal:
       - desciframos token
       - comprobamos que SHA-256 coincida

       Caso legacy o inconsistente:
       - generamos token nuevo
       - guardamos hash + token cifrado
    ===================================================== */

    let token:
      string | null =
      null;

    let needsRepair =
      false;

    if (
      form
        .access_token_encrypted
    ) {
      try {
        const decryptedToken =
          decryptIntakeToken(
            form
              .access_token_encrypted,
          );

        const decryptedHash =
          hashIntakeToken(
            decryptedToken,
          );

        if (
          decryptedHash ===
          form
            .access_token_hash
        ) {
          token =
            decryptedToken;
        } else {
          /*
            Tenemos token cifrado,
            pero no corresponde con
            el hash guardado.
          */
          needsRepair =
            true;
        }
      } catch (
        decryptError
      ) {
        console.error(
          "Intake token decrypt error:",
          decryptError,
        );

        needsRepair =
          true;
      }
    } else {
      /*
        Formulario creado antes
        del sistema de cifrado.
      */
      needsRepair =
        true;
    }

    /* =====================================================
       AUTOREPARACIÓN
    ===================================================== */

    if (needsRepair) {
      const access =
        createIntakeAccess();

      token =
        access.token;

      const encryptedToken =
        encryptIntakeToken(
          access.token,
        );

      const {
        error:
          repairError,
      } = await supabase
        .from(
          "booking_intake_forms",
        )
        .update({
          access_token_hash:
            access.tokenHash,

          access_token_encrypted:
            encryptedToken,
        })
        .eq(
          "id",
          form.id,
        );

      if (
        repairError
      ) {
        console.error(
          "Intake token repair error:",
          repairError,
        );

        return NextResponse.json(
          {
            error:
              "No fue posible recuperar el acceso al formulario.",
          },
          {
            status: 500,
          },
        );
      }
    }

    if (!token) {
      return NextResponse.json(
        {
          error:
            "No fue posible generar el acceso al formulario.",
        },
        {
          status: 500,
        },
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
    });
  } catch (error) {
    console.error(
      "Admin intake link error:",
      error,
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