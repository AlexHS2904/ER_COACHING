import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  revalidatePath,
} from "next/cache";

import {
  isActiveAdmin,
} from "@/lib/admin/is-active-admin";

import {
  activateBookingIntake,
} from "@/lib/intake/activate-booking-intake";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { googleErrorLogMetadata } from "@/lib/google/safe-error";
import { serviceRequiresPayment } from "@/lib/bookings/payment-policy";

type Body = {
  bookingId?:
    unknown;
};

export async function POST(
  request: NextRequest,
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
        status:
          401,
      },
    );
  }

  try {
    const body =
      (await request.json()) as Body;

    if (
      typeof body
        .bookingId !==
        "string" ||
      !body
        .bookingId
        .trim()
    ) {
      return NextResponse.json(
        {
          error:
            "La reserva es obligatoria.",
        },
        {
          status:
            400,
        },
      );
    }

    const origin =
      new URL(
        request.url,
      ).origin;

    const booking = await getSupabaseAdmin().from("bookings")
      .select("payment_flow,payment_status,payment_provider,paid_at,price_snapshot")
      .eq("id", body.bookingId.trim()).maybeSingle();
    if (booking.error || !booking.data) {
      return NextResponse.json({ error: "Reserva no encontrada." }, { status: 404 });
    }
    if (booking.data.payment_flow === "stripe") {
      return NextResponse.json({ error: "El pago de esta reserva debe confirmarse mediante Stripe." }, { status: 409 });
    }
    if (serviceRequiresPayment(booking.data.price_snapshot) &&
        (booking.data.payment_status !== "paid" || booking.data.payment_provider !== "stripe" || !booking.data.paid_at)) {
      return NextResponse.json(
        { error: "Los servicios con pago requerido solo pueden confirmarse con el pago de Stripe registrado." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result =
      await activateBookingIntake(
        {
          bookingId:
            body
              .bookingId
              .trim(),

          provider:
            "manual",

          paymentReference:
            null,

          siteUrl:
            origin,
        },
      );

    revalidatePath(
      "/admin/reservas",
    );

    return NextResponse.json(
      // Preserve the existing admin API field; public redirects never consume
      // this authorized administrative response or the canonical email URL.
      { ...result, formUrl: result.canonicalIntakeUrl },
      {
        status:
          200,
      },
    );
  } catch (error) {
    console.error(
      "Mark paid error:",
      googleErrorLogMetadata(error),
    );

    return NextResponse.json(
      {
        error:
          error instanceof
          Error
            ? error.message
            : "No fue posible registrar el pago.",
      },
      {
        status:
          400,
      },
    );
  }
}
