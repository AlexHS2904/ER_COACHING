import "server-only";

import CustomerBookingEmail from "@/emails/CustomerBookingEmail";
import CoachBookingEmail from "@/emails/CoachBookingEmail";

import {
  getResend,
} from "@/lib/email/resend";

type Input = {
  bookingId: string;
  bookingReference: string;

  customerName: string;
  customerEmail: string;
  customerPhone:
    | string
    | null;

  serviceName: string;

  startsAt: string;

  durationMinutes: number;
  sessionCount: number;

  price:
    | number
    | string
    | null;

  currency: string;

  notes:
    | string
    | null;

  meetUrl:
    | string
    | null;

  calendarUrl:
    | string
    | null;

  /*
    Solo existe cuando la reserva
    pertenece a un proceso de coaching.
  */

  processAccessUrl?:
    | string
    | null;

  /*
    Nos permite mostrar textos como:

    "Incluido en tu proceso"

    en lugar de:

    "Por cotizar"

    para las sesiones 2-6.
  */

  priceTextOverride?:
    | string
    | null;
};

/* =========================================================
   FORMAT DATE
========================================================= */

function formatBookingDate(
  startsAt: string,
) {
  return new Intl.DateTimeFormat(
    "es-MX",
    {
      weekday:
        "long",

      day:
        "numeric",

      month:
        "long",

      year:
        "numeric",

      timeZone:
        "America/Mexico_City",
    },
  ).format(
    new Date(
      startsAt,
    ),
  );
}

/* =========================================================
   FORMAT TIME
========================================================= */

function formatBookingTime(
  startsAt: string,
) {
  return new Intl.DateTimeFormat(
    "es-MX",
    {
      hour:
        "numeric",

      minute:
        "2-digit",

      hour12:
        true,

      timeZone:
        "America/Mexico_City",
    },
  ).format(
    new Date(
      startsAt,
    ),
  );
}

/* =========================================================
   FORMAT PRICE
========================================================= */

function formatPrice(
  price:
    | number
    | string
    | null,

  currency: string,
) {
  if (
    price === null
  ) {
    return "Por cotizar";
  }

  return new Intl.NumberFormat(
    "es-MX",
    {
      style:
        "currency",

      currency,

      maximumFractionDigits:
        0,
    },
  ).format(
    Number(
      price,
    ),
  );
}

/* =========================================================
   SEND EMAILS
========================================================= */

export async function sendBookingEmails(
  input: Input,
) {
  const resend =
    getResend();

  const from =
    process.env.RESEND_FROM_EMAIL;

  const coachEmail =
    process.env.COACH_EMAIL;

  if (!from) {
    throw new Error(
      "Missing RESEND_FROM_EMAIL",
    );
  }

  if (!coachEmail) {
    throw new Error(
      "Missing COACH_EMAIL",
    );
  }

  /* =======================================================
     FORMAT VALUES
  ======================================================= */

  const dateText =
    formatBookingDate(
      input.startsAt,
    );

  const timeText =
    formatBookingTime(
      input.startsAt,
    );

  const priceText =
    input.priceTextOverride ??
    formatPrice(
      input.price,
      input.currency,
    );

  /* =======================================================
     COMMON EMAIL DATA
  ======================================================= */

  const common = {
    serviceName:
      input.serviceName,

    dateText,
    timeText,

    durationMinutes:
      input.durationMinutes,

    sessionCount:
      input.sessionCount,

    priceText,

    bookingReference:
      input.bookingReference,

    meetUrl:
      input.meetUrl,
  };

  /* =======================================================
     SEND CUSTOMER + COACH
  ======================================================= */

  const [
    customerResult,
    coachResult,
  ] =
    await Promise.all([
      /* ==========================
         CUSTOMER
      ========================== */

      resend.emails.send(
        {
          from,

          to:
            input.customerEmail,

          subject:
            `Tu sesión está confirmada · ${input.bookingReference}`,

          react:
            CustomerBookingEmail(
              {
                ...common,

                customerName:
                  input.customerName,

                calendarUrl:
                  input.calendarUrl,

                processAccessUrl:
                  input.processAccessUrl ??
                  null,
              },
            ),
        },
        {
          idempotencyKey:
            `booking/${input.bookingId}/customer`,
        },
      ),

      /* ==========================
         COACH
      ========================== */

      resend.emails.send(
        {
          from,

          to:
            coachEmail,

          subject:
            `Nueva reserva · ${input.customerName}`,

          react:
            CoachBookingEmail(
              {
                ...common,

                customerName:
                  input.customerName,

                customerEmail:
                  input.customerEmail,

                customerPhone:
                  input.customerPhone,

                notes:
                  input.notes,
              },
            ),
        },
        {
          idempotencyKey:
            `booking/${input.bookingId}/coach`,
        },
      ),
    ]);

  /* =======================================================
     RESULT
  ======================================================= */

  return {
    customer: {
      id:
        customerResult.data
          ?.id ??
        null,

      error:
        customerResult.error
          ?.message ??
        null,
    },

    coach: {
      id:
        coachResult.data
          ?.id ??
        null,

      error:
        coachResult.error
          ?.message ??
        null,
    },
  };
}