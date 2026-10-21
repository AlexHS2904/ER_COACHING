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
      result,
      {
        status:
          200,
      },
    );
  } catch (error) {
    console.error(
      "Mark paid error:",
      error,
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