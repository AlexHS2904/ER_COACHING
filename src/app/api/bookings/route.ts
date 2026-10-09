import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createProcessAccess } from "@/lib/coaching/process-access";
import { sendBookingEmails } from "@/lib/email/send-booking-emails";
import { createGoogleCalendarEvent } from "@/lib/google/calendar";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/* =========================================================
   TYPES
========================================================= */

type BookingBody = {
  service?: unknown;
  startsAt?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  notes?: unknown;
};

type BookingRpcResult = {
  booking_id: string;
  booking_reference: string;

  process_id?: string | null;
  process_reference?: string | null;
};

/* =========================================================
   HELPERS
========================================================= */

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email,
  );
}

/* =========================================================
   POST /api/bookings
========================================================= */

export async function POST(
  request: NextRequest,
) {
  const supabase =
    getSupabaseAdmin();

  /* =======================================================
     IDS / ESTADO CREADO DURANTE LA OPERACIÓN
  ======================================================= */

  let createdBookingId:
    | string
    | null = null;

  let createdProcessId:
    | string
    | null = null;

  let processReference:
    | string
    | null = null;

  let processAccessToken:
    | string
    | null = null;

  /*
    Nos permite distinguir entre:

    - booking creado pero Calendar falló
    - booking ya confirmado y después falló email

    Un fallo de email NO debe cancelar la cita.
  */

  let bookingConfirmed =
    false;

  /* =======================================================
     HELPER DE LIMPIEZA DEL PROCESO
  ======================================================= */

  async function cancelCreatedProcess() {
    if (!createdProcessId) {
      return;
    }

    const {
      error:
        processCancelError,
    } = await supabase
      .from(
        "coaching_processes",
      )
      .update({
        status:
          "cancelled",
      })
      .eq(
        "id",
        createdProcessId,
      );

    if (processCancelError) {
      console.error(
        "Error cancelling coaching process:",
        processCancelError,
      );
    }
  }

  try {
    /* =====================================================
       1. LEER BODY
    ===================================================== */

    const body =
      (await request.json()) as BookingBody;

    /* =====================================================
       2. VALIDAR SERVICIO
    ===================================================== */

    if (
      typeof body.service !==
        "string" ||
      !body.service.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "El servicio es obligatorio.",
        },
        {
          status: 400,
        },
      );
    }

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
       4. VALIDAR NOMBRE
    ===================================================== */

    if (
      typeof body.name !==
        "string" ||
      body.name.trim().length <
        2
    ) {
      return NextResponse.json(
        {
          error:
            "Ingresa tu nombre completo.",
        },
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       5. VALIDAR EMAIL
    ===================================================== */

    if (
      typeof body.email !==
        "string" ||
      !isValidEmail(
        body.email.trim(),
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Ingresa un correo electrónico válido.",
        },
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       6. CAMPOS OPCIONALES
    ===================================================== */

    const phone =
      typeof body.phone ===
      "string"
        ? body.phone.trim()
        : "";

    const notes =
      typeof body.notes ===
      "string"
        ? body.notes.trim()
        : "";

    if (
      phone.length > 30
    ) {
      return NextResponse.json(
        {
          error:
            "El teléfono ingresado es demasiado largo.",
        },
        {
          status: 400,
        },
      );
    }

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
       VALORES LIMPIOS
    ===================================================== */

    const serviceSlug =
      body.service.trim();

    const customerName =
      body.name.trim();

    const customerEmail =
      body.email
        .trim()
        .toLowerCase();

    /* =====================================================
       7. IDENTIFICAR TIPO DE SERVICIO

       Esto NO sustituye las validaciones de PostgreSQL.

       Solo determina qué RPC utilizamos:

       single  → create_booking
       package → create_package_booking
    ===================================================== */

    const {
      data: service,
      error: serviceError,
    } = await supabase
      .from("services")
      .select(
        `
          service_type,
          booking_enabled,
          requires_quote
        `,
      )
      .eq(
        "slug",
        serviceSlug,
      )
      .eq(
        "active",
        true,
      )
      .maybeSingle();

    if (
      serviceError ||
      !service
    ) {
      console.error(
        "Error reading service:",
        serviceError,
      );

      return NextResponse.json(
        {
          error:
            "El servicio seleccionado no está disponible.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !service.booking_enabled ||
      service.requires_quote
    ) {
      return NextResponse.json(
        {
          error:
            "El servicio seleccionado no está disponible para reservar.",
        },
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       8. CREAR BOOKING / PROCESO
    ===================================================== */

    let bookingResult:
      | BookingRpcResult[]
      | null = null;

    let bookingError:
      | {
          message: string;
        }
      | null = null;

    /* =====================================================
       PAQUETE
    ===================================================== */

    if (
      service.service_type ===
      "package"
    ) {
      /*
        El token REAL vive únicamente en Next.js
        y en el enlace que recibirá el cliente.

        Supabase recibe solamente SHA-256(token).
      */

      const {
        token,
        tokenHash,
      } =
        createProcessAccess();

      processAccessToken =
        token;

      const rpcResult =
        await supabase.rpc(
          "create_package_booking",
          {
            p_service_slug:
              serviceSlug,

            p_starts_at:
              startsAt.toISOString(),

            p_customer_name:
              customerName,

            p_customer_email:
              customerEmail,

            p_access_token_hash:
              tokenHash,

            p_customer_phone:
              phone ||
              null,

            p_notes:
              notes ||
              null,
          },
        );

      bookingResult =
        rpcResult.data as
          | BookingRpcResult[]
          | null;

      bookingError =
        rpcResult.error;
    } else {
      /* ===================================================
         RESERVA INDIVIDUAL
      =================================================== */

      const rpcResult =
        await supabase.rpc(
          "create_booking",
          {
            p_service_slug:
              serviceSlug,

            p_starts_at:
              startsAt.toISOString(),

            p_customer_name:
              customerName,

            p_customer_email:
              customerEmail,

            p_customer_phone:
              phone ||
              null,

            p_notes:
              notes ||
              null,
          },
        );

      bookingResult =
        rpcResult.data as
          | BookingRpcResult[]
          | null;

      bookingError =
        rpcResult.error;
    }

    /* =====================================================
       9. MANEJAR ERROR DE POSTGRESQL
    ===================================================== */

    if (bookingError) {
      console.error(
        "Error creating booking:",
        bookingError,
      );

      const unavailable =
        bookingError.message.includes(
          "ya no está disponible",
        ) ||
        bookingError.message.includes(
          "acaba de ser reservado",
        );

      return NextResponse.json(
        {
          error: unavailable
            ? "Ese horario ya no está disponible. Selecciona otro."
            : "No fue posible confirmar la reserva.",
        },
        {
          status: unavailable
            ? 409
            : 500,
        },
      );
    }

    const result =
      bookingResult?.[0];

    if (
      !result?.booking_id ||
      !result?.booking_reference
    ) {
      return NextResponse.json(
        {
          error:
            "No fue posible crear la reserva.",
        },
        {
          status: 500,
        },
      );
    }

    /* =====================================================
       10. GUARDAR IDS CREADOS
    ===================================================== */

    createdBookingId =
      result.booking_id;

    if (
      service.service_type ===
      "package"
    ) {
      if (
        !result.process_id ||
        !result.process_reference
      ) {
        await supabase
          .from("bookings")
          .update({
            status:
              "cancelled",

            integration_error:
              "No fue posible recuperar el proceso de coaching.",
          })
          .eq(
            "id",
            createdBookingId,
          );

        return NextResponse.json(
          {
            error:
              "No fue posible crear el proceso de coaching.",
          },
          {
            status: 500,
          },
        );
      }

      createdProcessId =
        result.process_id;

      processReference =
        result.process_reference;
    }

    /* =====================================================
       11. LEER BOOKING COMPLETO

       IMPORTANTÍSIMO:

       usamos los snapshots guardados
       por PostgreSQL.

       No confiamos en precios/duración
       enviados desde el navegador.
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
        "Error reading booking:",
        bookingReadError,
      );

      await supabase
        .from("bookings")
        .update({
          status:
            "cancelled",

          integration_error:
            "No fue posible recuperar la reserva después de crearla.",
        })
        .eq(
          "id",
          createdBookingId,
        );

      await cancelCreatedProcess();

      return NextResponse.json(
        {
          error:
            "No fue posible completar la reserva.",
        },
        {
          status: 500,
        },
      );
    }

    /* =====================================================
       12. CREAR GOOGLE CALENDAR + GOOGLE MEET
    ===================================================== */

    let calendarResult;

    try {
      calendarResult =
        await createGoogleCalendarEvent(
          {
            bookingReference:
              booking.booking_reference,

            serviceName:
              booking.service_name_snapshot,

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
        "Google Calendar error:",
        calendarError,
      );

      /*
        Calendar es parte esencial
        de la reserva.

        Si falla:

        booking → cancelled

        y, si era la primera sesión
        de un paquete:

        coaching_process → cancelled
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

      await cancelCreatedProcess();

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
       13. GUARDAR CALENDAR + MEET

       Aquí la reserva pasa:

       pending → confirmed
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
        "Error saving calendar data:",
        calendarSaveError,
      );

      /*
        Aquí NO cancelamos automáticamente.

        El evento ya fue creado en Google Calendar.

        Cancelar el booking sin eliminar primero
        el evento podría dejar el calendario y
        nuestra base de datos inconsistentes.
      */

      return NextResponse.json(
        {
          error:
            "La cita se creó en Google Calendar, pero ocurrió un problema guardando la confirmación.",
        },
        {
          status: 500,
        },
      );
    }

    bookingConfirmed =
      true;

    /* =====================================================
       14. ENVIAR LOS DOS CORREOS

       - ticket cliente
       - ticket coach

       IMPORTANTE:

       si un email falla, NO cancelamos
       la reserva.

       La cita ya existe.
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
        createdProcessId &&
        processAccessToken
            ? new URL(
                `/proceso/${processAccessToken}`,
                request.nextUrl.origin,
            ).toString()
            : null;

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
              booking.service_name_snapshot,

            startsAt:
              booking.starts_at,

            durationMinutes:
              booking.duration_minutes_snapshot,

            sessionCount:
              booking.session_count_snapshot ??
              1,

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
          },
        );
    } catch (emailError) {
      console.error(
        "Email integration error:",
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
       15. GUARDAR ESTADO INICIAL DE EMAILS

       Aquí solo sabemos:

       sent   → Resend aceptó el email
       failed → ni siquiera pudo enviarse

       delivered / bounced llegan después
       mediante webhook.
    ===================================================== */

    const now =
      new Date().toISOString();

    const {
      error:
        emailSaveError,
    } = await supabase
      .from("bookings")
      .update({
        /* ===============================
           CLIENTE
        =============================== */

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

        /* ===============================
           COACH
        =============================== */

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
        Esto NO cancela el booking.

        Calendar ya existe y la cita
        está confirmada.
      */

      console.error(
        "Error saving email status:",
        emailSaveError,
      );
    }

    /* =====================================================
       16. RESPUESTA FINAL AL FRONTEND
    ===================================================== */

    return NextResponse.json(
      {
        success: true,

        bookingId:
          booking.id,

        bookingReference:
          booking.booking_reference,

        /*
          Para una reserva normal:
          process = null

          Para un paquete:
          enviamos el acceso privado.
        */

        process:
          createdProcessId &&
          processReference &&
          processAccessToken
            ? {
                processId:
                  createdProcessId,

                processReference,

                accessPath:
                  `/proceso/${processAccessToken}`,
              }
            : null,

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
      "Unexpected booking error:",
      error,
    );

    /* =====================================================
       MANEJO DE ERROR INESPERADO
    ===================================================== */

    /*
      Solo cancelamos automáticamente
      si todavía NO habíamos confirmado
      Calendar.

      Si ya tenemos:

      status = confirmed
      calendar_status = created

      un error posterior jamás debe
      liberar el horario.
    */

    if (
      createdBookingId &&
      !bookingConfirmed
    ) {
      const {
        error:
          bookingCancelError,
      } = await supabase
        .from("bookings")
        .update({
          status:
            "cancelled",

          integration_error:
            error instanceof Error
              ? error.message
              : "Error inesperado.",
        })
        .eq(
          "id",
          createdBookingId,
        );

      if (
        bookingCancelError
      ) {
        console.error(
          "Error cancelling booking:",
          bookingCancelError,
        );
      }
    }

    if (
      createdProcessId &&
      !bookingConfirmed
    ) {
      await cancelCreatedProcess();
    }

    return NextResponse.json(
      {
        error:
          bookingConfirmed
            ? "La reserva fue creada, pero ocurrió un problema procesando información adicional."
            : "Ocurrió un error al procesar la reserva.",
      },
      {
        status: 500,
      },
    );
  }
}