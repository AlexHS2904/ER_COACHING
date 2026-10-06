import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  updateGoogleCalendarEvent,
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

type RescheduleBody = {
  startsAt?: unknown;
};

type RescheduleSlot = {
  starts_at: string;
  ends_at: string;
};

const TIME_ZONE =
  "America/Mexico_City";

/* =========================================================
   FECHA LOCAL MÉXICO
========================================================= */

function getMexicoDateKey(
  value: Date,
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          TIME_ZONE,

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",
      },
    ).formatToParts(
      value,
    );

  const year =
    parts.find(
      (part) =>
        part.type ===
        "year",
    )?.value;

  const month =
    parts.find(
      (part) =>
        part.type ===
        "month",
    )?.value;

  const day =
    parts.find(
      (part) =>
        part.type ===
        "day",
    )?.value;

  if (
    !year ||
    !month ||
    !day
  ) {
    throw new Error(
      "No fue posible determinar la fecha.",
    );
  }

  return `${year}-${month}-${day}`;
}

/* =========================================================
   VALIDAR YYYY-MM-DD
========================================================= */

function isValidDateKey(
  value: string,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return false;
  }

  const [
    year,
    month,
    day,
  ] =
    value
      .split("-")
      .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  return (
    date.getUTCFullYear() ===
      year &&
    date.getUTCMonth() ===
      month - 1 &&
    date.getUTCDate() ===
      day
  );
}

/* =========================================================
   AUTORIZAR ADMIN
========================================================= */

async function authorizeAdmin() {
  const supabase =
    await createClient();

  const {
    data: claimsData,
  } =
    await supabase.auth.getClaims();

  const userId =
    claimsData
      ?.claims?.sub;

  if (!userId) {
    return {
      allowed: false,
      status: 401,
      error:
        "No autorizado.",
    } as const;
  }

  const {
    data: admin,
    error,
  } = await supabase
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
    error ||
    !admin ||
    !admin.active
  ) {
    return {
      allowed: false,
      status: 403,
      error:
        "No tienes permisos para realizar esta acción.",
    } as const;
  }

  return {
    allowed: true,
  } as const;
}

/* =========================================================
   GET

   DEVUELVE SLOTS DISPONIBLES PARA UNA FECHA
========================================================= */

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const authorization =
    await authorizeAdmin();

  if (
    !authorization.allowed
  ) {
    return NextResponse.json(
      {
        error:
          authorization.error,
      },
      {
        status:
          authorization.status,
      },
    );
  }

  const { id } =
    await context.params;

  const date =
    request.nextUrl
      .searchParams
      .get("date");

  if (
    !date ||
    !isValidDateKey(
      date,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Selecciona una fecha válida.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    getSupabaseAdmin();

  const {
    data: booking,
    error: bookingError,
  } = await supabase
    .from("bookings")
    .select(`
      id,
      status
    `)
    .eq(
      "id",
      id,
    )
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
          "Esta reserva ya no puede reprogramarse.",
      },
      {
        status: 409,
      },
    );
  }

  const {
    data: slots,
    error: slotsError,
  } = await supabase.rpc(
    "get_reschedule_slots",
    {
      p_booking_id:
        id,

      p_date:
        date,
    },
  );

  if (slotsError) {
    console.error(
      "Reschedule availability error:",
      slotsError,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible consultar los horarios disponibles.",
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    slots:
      slots ?? [],
  });
}

/* =========================================================
   POST

   REPROGRAMAR
========================================================= */

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const authorization =
    await authorizeAdmin();

  if (
    !authorization.allowed
  ) {
    return NextResponse.json(
      {
        error:
          authorization.error,
      },
      {
        status:
          authorization.status,
      },
    );
  }

  const { id } =
    await context.params;

  let body:
    | RescheduleBody
    | undefined;

  try {
    body =
      (await request.json()) as RescheduleBody;
  } catch {
    return NextResponse.json(
      {
        error:
          "Solicitud no válida.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    typeof body.startsAt !==
      "string" ||
    !body.startsAt.trim()
  ) {
    return NextResponse.json(
      {
        error:
          "Selecciona un horario.",
      },
      {
        status: 400,
      },
    );
  }

  const requestedStartsAt =
    new Date(
      body.startsAt,
    );

  if (
    Number.isNaN(
      requestedStartsAt.getTime(),
    )
  ) {
    return NextResponse.json(
      {
        error:
          "El horario seleccionado no es válido.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    getSupabaseAdmin();

  /* =========================================
     LEER RESERVA ACTUAL
  ========================================== */

  const {
    data: booking,
    error: bookingError,
  } = await supabase
    .from("bookings")
    .select(`
      id,
      status,
      starts_at,
      ends_at,
      google_event_id
    `)
    .eq(
      "id",
      id,
    )
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
          "Esta reserva ya no puede reprogramarse.",
      },
      {
        status: 409,
      },
    );
  }

  /* =========================================
     EVITAR NO-OP
  ========================================== */

  if (
    new Date(
      booking.starts_at,
    ).getTime() ===
    requestedStartsAt.getTime()
  ) {
    return NextResponse.json(
      {
        error:
          "Selecciona un horario diferente al actual.",
      },
      {
        status: 400,
      },
    );
  }

  /* =========================================
     VOLVER A VALIDAR DISPONIBILIDAD

     No confiamos en el slot enviado por
     el navegador.
  ========================================== */

  const localDate =
    getMexicoDateKey(
      requestedStartsAt,
    );

  const {
    data: slots,
    error: slotsError,
  } = await supabase.rpc(
    "get_reschedule_slots",
    {
      p_booking_id:
        id,

      p_date:
        localDate,
    },
  );

  if (slotsError) {
    console.error(
      "Reschedule slot validation error:",
      slotsError,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible validar el horario seleccionado.",
      },
      {
        status: 500,
      },
    );
  }

  const availableSlots =
  (slots ?? []) as RescheduleSlot[];

    const selectedSlot =
    availableSlots.find(
        (slot) =>
        new Date(
            slot.starts_at,
        ).getTime() ===
        requestedStartsAt.getTime(),
    );

  if (!selectedSlot) {
    return NextResponse.json(
      {
        error:
          "Ese horario ya no está disponible. Selecciona otro.",
      },
      {
        status: 409,
      },
    );
  }

  const newStartsAt =
    new Date(
      selectedSlot.starts_at,
    ).toISOString();

  const newEndsAt =
    new Date(
      selectedSlot.ends_at,
    ).toISOString();

  const oldStartsAt =
    new Date(
      booking.starts_at,
    ).toISOString();

  const oldEndsAt =
    new Date(
      booking.ends_at,
    ).toISOString();

  let calendarMoved =
    false;

  /* =========================================
     1. MOVER GOOGLE PRIMERO

     La reserva todavía conserva su
     horario anterior en Supabase.

     Así, si Google falla, no tocamos DB.
  ========================================== */

  if (
    booking.google_event_id
  ) {
    try {
      await updateGoogleCalendarEvent({
        eventId:
          booking.google_event_id,

        startsAt:
          newStartsAt,

        endsAt:
          newEndsAt,
      });

      calendarMoved =
        true;
    } catch (error) {
      console.error(
        "Google reschedule error:",
        error,
      );

      return NextResponse.json(
        {
          error:
            "No fue posible actualizar Google Calendar. La reserva conserva su horario anterior.",
        },
        {
          status: 502,
        },
      );
    }
  }

  /* =========================================
     2. ACTUALIZAR SUPABASE

     La restricción de exclusión protege
     contra dos reservas simultáneas.
  ========================================== */

  const {
    data: updatedBooking,
    error: updateError,
  } = await supabase
    .from("bookings")
    .update({
      starts_at:
        newStartsAt,

      ends_at:
        newEndsAt,

      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      booking.id,
    )
    /*
      Optimistic concurrency:
      verificamos que nadie haya cambiado
      esta reserva mientras trabajábamos.
    */
    .eq(
      "starts_at",
      booking.starts_at,
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
      booking_reference,
      starts_at,
      ends_at,
      status
    `)
    .maybeSingle();

  if (
    updateError ||
    !updatedBooking
  ) {
    console.error(
      "Database reschedule error:",
      updateError,
    );

    /* =====================================
       COMPENSACIÓN

       Google sí se movió pero DB falló.
       Intentamos regresarlo a su hora
       original.
    ====================================== */

    if (
      calendarMoved &&
      booking.google_event_id
    ) {
      try {
        await updateGoogleCalendarEvent({
          eventId:
            booking.google_event_id,

          startsAt:
            oldStartsAt,

          endsAt:
            oldEndsAt,
        });
      } catch (
        rollbackError
      ) {
        console.error(
          "CRITICAL: Google rollback failed:",
          rollbackError,
        );

        return NextResponse.json(
          {
            error:
              "Hubo un problema al reprogramar y Google Calendar requiere revisión manual.",
          },
          {
            status: 500,
          },
        );
      }
    }

    const conflict =
      updateError?.code ===
        "23P01" ||
      updateError?.message
        ?.toLowerCase()
        .includes(
          "exclusion",
        );

    return NextResponse.json(
      {
        error:
          conflict
            ? "Ese horario acaba de ser ocupado. Selecciona otro."
            : "No fue posible actualizar la reserva. Se conservó el horario anterior.",
      },
      {
        status:
          conflict
            ? 409
            : 500,
      },
    );
  }

  return NextResponse.json({
    ok: true,

    booking:
      updatedBooking,

    calendarUpdated:
      calendarMoved,
  });
}