import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  deleteGoogleCalendarEvent,
} from "@/lib/google/calendar";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

import {
  createClient,
} from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  _request: NextRequest,
  context: RouteContext,
) {
  const { id } =
    await context.params;

  /* =========================================
     VALIDAR SESIÓN
  ========================================== */

  const authSupabase =
    await createClient();

  const {
    data: claimsData,
  } =
    await authSupabase.auth.getClaims();

  const userId =
    claimsData?.claims?.sub;

  if (!userId) {
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

  /* =========================================
     VALIDAR ADMIN
  ========================================== */

  const {
    data: admin,
    error: adminError,
  } = await authSupabase
    .from("admin_users")
    .select(`
      user_id,
      active
    `)
    .eq(
      "user_id",
      userId,
    )
    .maybeSingle();

  if (
    adminError ||
    !admin ||
    !admin.active
  ) {
    return NextResponse.json(
      {
        error:
          "No tienes permisos para realizar esta acción.",
      },
      {
        status: 403,
      },
    );
  }

  /* =========================================
     OBTENER RESERVA
  ========================================== */

  const supabase =
    getSupabaseAdmin();

  const {
    data: booking,
    error: bookingError,
  } = await supabase
    .from("bookings")
    .select(`
      id,
      status,
      booking_reference,
      customer_name,
      google_event_id
    `)
    .eq("id", id)
    .maybeSingle();

  if (
    bookingError ||
    !booking
  ) {
    return NextResponse.json(
      {
        error:
          "La reserva no existe.",
      },
      {
        status: 404,
      },
    );
  }

  /* =========================================
     HACER IDEMPOTENTE LA CANCELACIÓN
  ========================================== */

  if (
    booking.status ===
    "cancelled"
  ) {
    return NextResponse.json({
      ok: true,
      status: "cancelled",
      bookingId:
        booking.id,
    });
  }

  if (
    ![
      "pending",
      "confirmed",
    ].includes(
      booking.status,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Esta reserva ya no puede cancelarse.",
      },
      {
        status: 409,
      },
    );
  }

  /* =========================================
     CANCELAR GOOGLE CALENDAR PRIMERO
  ========================================== */

  if (
    booking.google_event_id
  ) {
    try {
      await deleteGoogleCalendarEvent(
        booking.google_event_id,
      );
    } catch (error) {
      console.error(
        "Google Calendar cancellation error:",
        error,
      );

      /*
        No modificamos Supabase.

        Así evitamos tener una reserva
        cancelada mientras el evento
        sigue activo en Google.
      */
      return NextResponse.json(
        {
          error:
            "No fue posible cancelar el evento de Google Calendar. La reserva sigue activa.",
        },
        {
          status: 502,
        },
      );
    }
  }

  /* =========================================
     CANCELAR RESERVA
  ========================================== */

  const {
    data: cancelledBooking,
    error: updateError,
  } = await supabase
    .from("bookings")
    .update({
      status:
        "cancelled",

      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      booking.id,
    )
    .in(
      "status",
      [
        "pending",
        "confirmed",
      ],
    )
    .select(`
      id,
      status
    `)
    .maybeSingle();

  if (
    updateError ||
    !cancelledBooking
  ) {
    console.error(
      "Booking cancellation database error:",
      updateError,
    );

    return NextResponse.json(
      {
        error:
          "El evento de Calendar fue cancelado, pero no fue posible actualizar la reserva. Intenta nuevamente.",
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    ok: true,

    bookingId:
      cancelledBooking.id,

    status:
      cancelledBooking.status,
  });
}