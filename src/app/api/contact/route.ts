import {
  NextRequest,
  NextResponse,
} from "next/server";

import ContactMessageEmail from "@/emails/ContactMessageEmail";
import ContactConfirmationEmail from "@/emails/ContactConfirmationEmail";

import {
  getResend,
} from "@/lib/email/resend";

type ContactBody = {
  name?: unknown;
  email?: unknown;
  subject?: unknown;
  message?: unknown;
  company?: unknown;
};

const VALID_SUBJECTS =
  new Set([
    "individual",
    "process",
    "group",
    "other",
  ]);

function isValidEmail(
  email: string,
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email,
  );
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as ContactBody;

    /* =====================================================
       HONEYPOT
    ===================================================== */

    if (
      typeof body.company ===
        "string" &&
      body.company.trim()
    ) {
      /*
        Respondemos success para no
        avisarle al bot que fue detectado.
      */

      return NextResponse.json({
        success:
          true,
      });
    }

    /* =====================================================
       NORMALIZAR
    ===================================================== */

    const name =
      typeof body.name ===
      "string"
        ? body.name.trim()
        : "";

    const email =
      typeof body.email ===
      "string"
        ? body.email
            .trim()
            .toLowerCase()
        : "";

    const subject =
      typeof body.subject ===
      "string"
        ? body.subject.trim()
        : "";

    const message =
      typeof body.message ===
      "string"
        ? body.message.trim()
        : "";

    /* =====================================================
       VALIDAR
    ===================================================== */

    if (
      name.length < 2 ||
      name.length > 100
    ) {
      return NextResponse.json(
        {
          error:
            "El nombre no es válido.",
        },
        {
          status:
            400,
        },
      );
    }

    if (
      !isValidEmail(
        email,
      ) ||
      email.length > 254
    ) {
      return NextResponse.json(
        {
          error:
            "El correo electrónico no es válido.",
        },
        {
          status:
            400,
        },
      );
    }

    if (
      !VALID_SUBJECTS.has(
        subject,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Selecciona un motivo válido.",
        },
        {
          status:
            400,
        },
      );
    }

    if (
      message.length < 10 ||
      message.length > 2000
    ) {
      return NextResponse.json(
        {
          error:
            "El mensaje debe tener entre 10 y 2000 caracteres.",
        },
        {
          status:
            400,
        },
      );
    }

    /* =====================================================
       CONFIGURACIÓN EMAIL
    ===================================================== */

    const from =
      process.env
        .RESEND_FROM_EMAIL;

    const contactTo =
      process.env
        .CONTACT_TO_EMAIL;

    if (!from) {
      throw new Error(
        "Missing RESEND_FROM_EMAIL",
      );
    }

    if (!contactTo) {
      throw new Error(
        "Missing CONTACT_TO_EMAIL",
      );
    }

    const resend =
      getResend();

    /* =====================================================
       CORREO PARA EDNA

       replyTo hace que al pulsar Responder
       se responda directamente al cliente.
    ===================================================== */

    const coachResult =
      await resend
        .emails
        .send({
          from,

          to:
            contactTo,

          replyTo:
            email,

          subject:
            `Nueva consulta · ${name}`,

          react:
            ContactMessageEmail({
              name,
              email,
              subject,
              message,
            }),
        });

    if (
      coachResult.error ||
      !coachResult.data?.id
    ) {
      console.error(
        "Contact email error:",
        coachResult.error,
      );

      return NextResponse.json(
        {
          error:
            "No fue posible enviar tu mensaje. Intenta nuevamente.",
        },
        {
          status:
            502,
        },
      );
    }

    /* =====================================================
       CONFIRMACIÓN AL CLIENTE

       Si esta segunda notificación falla,
       NO decimos que el formulario falló:
       Edna ya recibió el mensaje.
    ===================================================== */

    try {
      const confirmation =
        await resend
          .emails
          .send({
            from,

            to:
              email,

            subject:
              "Recibimos tu mensaje · ER Coaching",

            react:
              ContactConfirmationEmail({
                name,
              }),
          });

      if (
        confirmation.error
      ) {
        console.error(
          "Contact confirmation email error:",
          confirmation.error,
        );
      }
    } catch (
      confirmationError
    ) {
      console.error(
        "Contact confirmation email error:",
        confirmationError,
      );
    }

    return NextResponse.json(
      {
        success:
          true,
      },
      {
        status:
          200,
      },
    );
  } catch (error) {
    console.error(
      "Unexpected contact error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible enviar tu mensaje. Intenta nuevamente.",
      },
      {
        status:
          500,
      },
    );
  }
}