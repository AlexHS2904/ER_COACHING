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
import { sendBookingChangeEmail } from "@/lib/email/send-booking-change-email";
import { googleErrorLogMetadata } from "@/lib/google/safe-error";
import { requestStripeBookingChange } from "@/lib/bookings/stripe-booking-changes";
import { getStripeConfig } from "@/lib/stripe/server";

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

  // Reuse the existing active-admin endpoint. Identity is the verified session,
  // never a browser-supplied actor; this action sends no Calendar/email request.
  if (_request.headers?.get("content-type")?.includes("application/json")) {
    try {
      const body = await _request.json();
      if (!body || Object.keys(body).length !== 1 ||
          !["no_show", "approve_replacement", "consume"].includes(body.action)) {
        return NextResponse.json({ error: "La decisión no es válida." }, { status: 400 });
      }
      const config = getStripeConfig();
      if (_request.headers.get("origin") !== config.siteUrl) {
        return NextResponse.json({ error: "No autorizado." }, { status: 403 });
      }
      const result = await supabase.rpc("resolve_stripe_session_v1", {
        p_booking_id: id, p_action: body.action, p_admin_user_id: userId,
        p_stripe_mode: config.mode, p_stripe_account_id: config.accountId,
      });
      if (result.error || !result.data) throw new Error("resolution_unavailable");
      return NextResponse.json({ ok: true, status: result.data.status,
        sessionResolution: result.data.session_resolution }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json({ error: "No fue posible guardar la decisión. Revisa el estado y la vigencia de la sesión." }, { status: 409 });
    }
  }

  const {
    data: booking,
    error: bookingError,
  } = await supabase
    .from("bookings")
    .select(`
      id,
      status,
      payment_flow,
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

  if (booking.payment_flow === "stripe") {
    try {
      return NextResponse.json(await requestStripeBookingChange(booking.id, "cancelled", null, userId),
        { headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json({ error: "Esta reserva requiere revisión antes de guardar el cambio." },
        { status: 409, headers: { "Cache-Control": "no-store" } });
    }
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
        googleErrorLogMetadata(error),
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
      googleErrorLogMetadata(updateError),
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

  const emailWarning = await sendBookingChangeEmail(booking.id, "cancelled");
  return NextResponse.json({
    ok: true,

    emailWarning,

    bookingId:
      cancelledBooking.id,

    status:
      cancelledBooking.status,
  });
}
