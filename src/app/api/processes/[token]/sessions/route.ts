import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  hashProcessAccessToken,
} from "@/lib/coaching/process-access";

import {
  sendBookingEmails,
} from "@/lib/email/send-booking-emails";

import {
  createGoogleCalendarEvent,
} from "@/lib/google/calendar";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

/* =========================================================
   TYPES
========================================================= */

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type CreateSessionBody = {
  startsAt?: unknown;
  notes?: unknown;
};

type ProcessSessionResult = {
  booking_id: string;
  booking_reference: string;

  process_id: string;
  process_reference: string;

  package_session_number: number;
};

/* =========================================================
   POST
   /api/processes/[token]/sessions
========================================================= */

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const supabase =
    getSupabaseAdmin();

  let createdBookingId:
    | string
    | null = null;

  let bookingConfirmed =
    false;

  try {
    /* =====================================================
       1. TOKEN
    ===================================================== */

    const {
      token,
    } = await context.params;

    /*
      Los tokens son generados mediante:

      randomBytes(32).toString("hex")

      Por eso deben tener exactamente
      64 caracteres hexadecimales.
    */

    if (
      !/^[0-9a-f]{64}$/.test(
        token,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "El acceso al proceso no es válido.",
        },
        {
          status: 404,
        },
      );
    }

    const tokenHash =
      hashProcessAccessToken(
        token,
      );

    /* =====================================================
       2. LEER BODY
    ===================================================== */

    const body =
      (await request.json()) as CreateSessionBody;

    /* =====================================================
       3. VALIDAR HORARIO
    ===================================================== */

    if (
      typeof body.startsAt !==
        "string" ||
      !body.startsAt.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "El horario es obligatorio.",
        },
        {
          status: 400,
        },
      );
    }

    const startsAt =
      new Date(
        body.startsAt,
      );

    if (
      Number.isNaN(
        startsAt.getTime(),
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

    /* =====================================================
       4. NOTAS OPCIONALES
    ===================================================== */

    const notes =
      typeof body.notes ===
      "string"
        ? body.notes.trim()
        : "";

    if (
      notes.length > 2000
    ) {
      return NextResponse.json(
        {
          error:
            "Las notas son demasiado largas.",
        },
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       5. CREAR LA SIGUIENTE SESIÓN

       PostgreSQL decide cuál corresponde:

       2, 3, 4, 5 o 6.

       También vuelve a validar:

       - token
       - proceso activo
       - límite de sesiones
       - disponibilidad
       - doble booking
    ===================================================== */

    const {
      data:
        sessionResult,
      error:
        sessionError,
    } = await supabase.rpc(
      "create_process_session",
      {
        p_access_token_hash:
          tokenHash,

        p_starts_at:
          startsAt.toISOString(),

        p_notes:
          notes ||
          null,
      },
    );

    if (sessionError) {
      console.error(
        "Error creating process session:",
        sessionError,
      );

      const unavailable =
        sessionError.message.includes(
          "ya no está disponible",
        ) ||
        sessionError.message.includes(
          "acaba de ser reservado",
        );

      const completed =
        sessionError.message.includes(
          "todas las sesiones",
        );

      const invalidProcess =
        sessionError.message.includes(
          "no existe",
        ) ||
        sessionError.message.includes(
          "ya no está activo",
        );

      const duplicate =
        sessionError.message.includes(
          "ya fue agendada",
        );

      return NextResponse.json(
        {
          error: unavailable
            ? "Ese horario ya no está disponible. Selecciona otro."
            : completed
              ? "Ya se han utilizado todas las sesiones de este proceso."
              : invalidProcess
                ? "Este proceso de coaching ya no está disponible."
                : duplicate
                  ? "Esta sesión ya fue agendada. Actualiza la página."
                  : "No fue posible crear la sesión.",
        },
        {
          status:
            unavailable ||
            duplicate
              ? 409
              : invalidProcess
                ? 404
                : completed
                  ? 409
                  : 500,
        },
      );
    }

    const result =
      (
        sessionResult as
          | ProcessSessionResult[]
          | null
      )?.[0];

    if (
      !result?.booking_id ||
      !result?.booking_reference ||
      !result?.process_id ||
      !result?.process_reference ||
      !result?.package_session_number
    ) {
      return NextResponse.json(
        {
          error:
            "No fue posible crear la sesión.",
        },
        {
          status: 500,
        },
      );
    }

    createdBookingId =
      result.booking_id;

    /* =====================================================
       6. LEER BOOKING COMPLETO

       Igual que en /api/bookings:

       confiamos en los snapshots creados
       por PostgreSQL.
    ===================================================== */

    const {
      data: booking,
      error:
        bookingReadError,
    } = await supabase
      .from("bookings")
      .select(
        `
          id,
          booking_reference,

          process_id,
          package_session_number,

          service_name_snapshot,
          duration_minutes_snapshot,
          session_count_snapshot,
          price_snapshot,
          currency_snapshot,

          customer_name,
          customer_email,
          customer_phone,
          notes,

          starts_at,
          ends_at,

          status
        `,
      )
      .eq(
        "id",
        createdBookingId,
      )
      .single();

    if (
      bookingReadError ||
      !booking
    ) {
      console.error(
        "Error reading process booking:",
        bookingReadError,
      );

      await supabase
        .from("bookings")
        .update({
          status:
            "cancelled",

          integration_error:
            "No fue posible recuperar la sesión después de crearla.",
        })
        .eq(
          "id",
          createdBookingId,
        );

      return NextResponse.json(
        {
          error:
            "No fue posible completar la sesión.",
        },
        {
          status: 500,
        },
      );
    }

    /* =====================================================
       7. GOOGLE CALENDAR + MEET
    ===================================================== */

    let calendarResult;

    try {
      calendarResult =
        await createGoogleCalendarEvent(
          {
            bookingReference:
              booking.booking_reference,

            serviceName:
              `${booking.service_name_snapshot} · Sesión ${booking.package_session_number}`,

            customerName:
              booking.customer_name,

            customerEmail:
              booking.customer_email,

            startsAt:
              booking.starts_at,

            endsAt:
              booking.ends_at,

            notes:
              booking.notes,
          },
        );
    } catch (
      calendarError
    ) {
      console.error(
        "Google Calendar process session error:",
        calendarError,
      );

      /*
        Esta vez NO cancelamos todo el proceso.

        Solamente esta sesión.

        De esa forma el cliente puede volver
        a intentar agendarla.
      */

      await supabase
        .from("bookings")
        .update({
          status:
            "cancelled",

          calendar_status:
            "failed",

          integration_error:
            calendarError instanceof
            Error
              ? calendarError.message
              : "Error creando Google Calendar.",
        })
        .eq(
          "id",
          createdBookingId,
        );

      return NextResponse.json(
        {
          error:
            "No fue posible crear la videollamada. El horario no fue reservado. Intenta nuevamente.",
        },
        {
          status: 502,
        },
      );
    }

    /* =====================================================
       8. GUARDAR CALENDAR + CONFIRMAR
    ===================================================== */

    const {
      error:
        calendarSaveError,
    } = await supabase
      .from("bookings")
      .update({
        google_event_id:
          calendarResult.eventId,

        google_meet_url:
          calendarResult.meetUrl,

        google_calendar_url:
          calendarResult.calendarUrl,

        calendar_status:
          "created",

        status:
          "confirmed",

        integration_error:
          null,
      })
      .eq(
        "id",
        createdBookingId,
      );

    if (
      calendarSaveError
    ) {
      console.error(
        "Error saving process session calendar:",
        calendarSaveError,
      );

      /*
        El evento YA existe en Google Calendar.

        No marcamos la sesión como cancelada
        porque liberaríamos un horario que
        realmente está ocupado en Calendar.
      */

      return NextResponse.json(
        {
          error:
            "La sesión se creó en Google Calendar, pero ocurrió un problema guardando la confirmación.",
        },
        {
          status: 500,
        },
      );
    }

    bookingConfirmed =
      true;

    /* =====================================================
       9. EMAILS
    ===================================================== */

    let emailResult: {
      customer: {
        id:
          | string
          | null;

        error:
          | string
          | null;
      };

      coach: {
        id:
          | string
          | null;

        error:
          | string
          | null;
      };
    };

    const processAccessUrl =
        new URL(
            `/proceso/${token}`,
            request.nextUrl.origin,
        ).toString();

    try {
      emailResult =
        await sendBookingEmails(
          {
            bookingId:
              booking.id,

            bookingReference:
              booking.booking_reference,

            customerName:
              booking.customer_name,

            customerEmail:
              booking.customer_email,

            customerPhone:
              booking.customer_phone,

            serviceName:
              `${booking.service_name_snapshot} · Sesión ${booking.package_session_number}`,

            startsAt:
              booking.starts_at,

            durationMinutes:
              booking.duration_minutes_snapshot,

            sessionCount:
              1,

            /*
              Las sesiones posteriores no
              representan un nuevo cobro.

              create_process_session guarda
              price_snapshot = null.
            */

            price:
              booking.price_snapshot,

            currency:
              booking.currency_snapshot ??
              "MXN",

            notes:
              booking.notes,

            meetUrl:
              calendarResult.meetUrl,

            calendarUrl:
              calendarResult.calendarUrl,

            processAccessUrl,

            priceTextOverride:
            "Incluido en tu proceso",
          },
        );
    } catch (
      emailError
    ) {
      console.error(
        "Process session email error:",
        emailError,
      );

      const message =
        emailError instanceof
        Error
          ? emailError.message
          : "Error enviando correo.";

      emailResult = {
        customer: {
          id: null,
          error:
            message,
        },

        coach: {
          id: null,
          error:
            message,
        },
      };
    }

    /* =====================================================
       10. GUARDAR ESTADO DE EMAILS
    ===================================================== */

    const now =
      new Date().toISOString();

    const {
      error:
        emailSaveError,
    } = await supabase
      .from("bookings")
      .update({
        customer_email_id:
          emailResult.customer.id,

        customer_email_status:
          emailResult.customer.id
            ? "sent"
            : "failed",

        customer_email_sent_at:
          emailResult.customer.id
            ? now
            : null,

        customer_email_status_at:
          now,

        customer_email_error:
          emailResult.customer.error,

        coach_email_id:
          emailResult.coach.id,

        coach_email_status:
          emailResult.coach.id
            ? "sent"
            : "failed",

        coach_email_sent_at:
          emailResult.coach.id
            ? now
            : null,

        coach_email_status_at:
          now,

        coach_email_error:
          emailResult.coach.error,
      })
      .eq(
        "id",
        createdBookingId,
      );

    if (
      emailSaveError
    ) {
      /*
        No cancelamos la sesión.

        Calendar ya fue creado correctamente.
      */

      console.error(
        "Error saving process session email status:",
        emailSaveError,
      );
    }

    /* =====================================================
       11. RESPUESTA
    ===================================================== */

    return NextResponse.json(
      {
        success: true,

        bookingId:
          booking.id,

        bookingReference:
          booking.booking_reference,

        processId:
          result.process_id,

        processReference:
          result.process_reference,

        sessionNumber:
          booking.package_session_number,

        status:
          "confirmed",

        calendar: {
          eventId:
            calendarResult.eventId,

          calendarUrl:
            calendarResult.calendarUrl,

          meetUrl:
            calendarResult.meetUrl,

          conferenceStatus:
            calendarResult.conferenceStatus,
        },

        emails: {
          customer:
            emailResult.customer.id
              ? "sent"
              : "failed",

          coach:
            emailResult.coach.id
              ? "sent"
              : "failed",
        },
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(
      "Unexpected process session error:",
      error,
    );

    /*
      Si la sesión todavía no llegó a
      confirmed, liberamos el horario.

      IMPORTANTE:
      jamás cancelamos coaching_processes.
      Solo esta sesión.
    */

    if (
      createdBookingId &&
      !bookingConfirmed
    ) {
      const {
        error:
          cancelError,
      } = await supabase
        .from("bookings")
        .update({
          status:
            "cancelled",

          integration_error:
            error instanceof
            Error
              ? error.message
              : "Error inesperado.",
        })
        .eq(
          "id",
          createdBookingId,
        );

      if (cancelError) {
        console.error(
          "Error cancelling process session:",
          cancelError,
        );
      }
    }

    return NextResponse.json(
      {
        error:
          bookingConfirmed
            ? "La sesión fue creada, pero ocurrió un problema procesando información adicional."
            : "Ocurrió un error al procesar la sesión.",
      },
      {
        status: 500,
      },
    );
  }
}