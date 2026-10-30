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
  encryptIntakeToken,
} from "@/lib/intake/intake-token-crypto";

import {
  getResend,
} from "@/lib/email/resend";

import ManualIntakeInvitationEmail from "@/emails/ManualIntakeInvitationEmail";
import { googleErrorLogMetadata } from "@/lib/google/safe-error";

/* =========================================================
   TYPES
========================================================= */

type Body = {
  name?: unknown;
  email?: unknown;
};

/* =========================================================
   HELPERS
========================================================= */

function validEmail(
  email: string,
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email,
  );
}

/* =========================================================
   POST
   CREATE MANUAL INTAKE INVITATION
========================================================= */

export async function POST(
  request: NextRequest,
) {
  /* =====================================================
     1. ADMIN ACCESS
  ===================================================== */

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
    /* =====================================================
       2. BODY
    ===================================================== */

    const body =
      (await request.json()) as Body;

    const name =
      typeof body.name ===
      "string"
        ? body.name
            .trim()
            .slice(
              0,
              150,
            )
        : "";

    const email =
      typeof body.email ===
      "string"
        ? body.email
            .trim()
            .toLowerCase()
            .slice(
              0,
              254,
            )
        : "";

    /* =====================================================
       3. VALIDATION
    ===================================================== */

    if (
      name.length <
      2
    ) {
      return NextResponse.json(
        {
          error:
            "Ingresa el nombre.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !validEmail(
        email,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Ingresa un correo válido.",
        },
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       4. CREATE PRIVATE ACCESS

       IMPORTANTE:

       token
       → solamente va en el enlace

       accessTokenHash
       → solamente va en Supabase

       encryptedToken
       → permite que Admin recupere el mismo link
    ===================================================== */

    const access =
      createIntakeAccess();

    const token =
      access.token;

    /*
      Lo calculamos explícitamente desde el token.

      Esto garantiza que el valor almacenado en:
      access_token_hash

      SIEMPRE corresponda exactamente al token
      que colocamos en /formulario/[token].
    */

    const accessTokenHash =
      hashIntakeToken(
        token,
      );

    const encryptedToken =
      encryptIntakeToken(
        token,
      );

    /* =====================================================
       5. EXPIRATION
    ===================================================== */

    const expiresAt =
      new Date(
        Date.now() +
          30 *
            24 *
            60 *
            60 *
            1000,
      ).toISOString();

    /* =====================================================
       6. INSERT FORM
    ===================================================== */

    const supabase =
      getSupabaseAdmin();

    const {
      data: form,
      error:
        insertError,
    } = await supabase
      .from(
        "booking_intake_forms",
      )
      .insert({
        booking_id:
          null,

        source_type:
          "manual",

        invitee_name:
          name,

        invitee_email:
          email,

        /*
          NUNCA guardamos el token original
          en esta columna.
        */

        access_token_hash:
          accessTokenHash,

        /*
          El original solamente queda
          cifrado para recuperación desde Admin.
        */

        access_token_encrypted:
          encryptedToken,

        status:
          "active",

        current_step:
          1,

        expires_at:
          expiresAt,
      })
      .select(
        `
          id,
          invitee_name,
          invitee_email,
          source_type,
          status,
          expires_at
        `,
      )
      .single();

    if (
      insertError ||
      !form
    ) {
      console.error(
        "Manual intake insert error:",
        googleErrorLogMetadata(insertError),
      );

      return NextResponse.json(
        {
          error:
            "No fue posible crear la invitación.",
        },
        {
          status: 500,
        },
      );
    }

    /* =====================================================
       7. BUILD PUBLIC FORM URL

       Aquí usamos TOKEN ORIGINAL.

       Correcto:
       /formulario/${token}

       Incorrecto:
       /formulario/${accessTokenHash}
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

    /* =====================================================
       8. SEND INVITATION EMAIL

       La creación del formulario NO debe perderse
       si Resend falla.

       Por eso el email es independiente del INSERT.
    ===================================================== */

    let emailSent =
      false;

    try {
      const from =
        process.env
          .RESEND_FROM_EMAIL;

      if (!from) {
        throw new Error(
          "Missing RESEND_FROM_EMAIL",
        );
      }

      const emailResult =
        await getResend()
          .emails
          .send({
            from,

            to:
              email,

            subject:
              "Invitación a tu formulario · Edna Rojo Coaching",

            react:
              ManualIntakeInvitationEmail({
                name,
                formUrl,
              }),
          });

      if (
        emailResult.error
      ) {
        console.error(
          "Manual intake invitation Resend error:",
          googleErrorLogMetadata(emailResult.error),
        );
      } else {
        emailSent =
          true;
      }
    } catch (
      mailError
    ) {
      console.error(
        "Manual intake invitation email error:",
        googleErrorLogMetadata(mailError),
      );
    }

    /* =====================================================
       9. SUCCESS
    ===================================================== */

    return NextResponse.json(
      {
        success:
          true,

        id:
          form.id,

        formUrl,

        emailSent,

        expiresAt:
          form.expires_at,
      },
      {
        status: 201,
      },
    );
  } catch (
    error
  ) {
    console.error(
      "Manual intake creation error:",
      googleErrorLogMetadata(error),
    );

    return NextResponse.json(
      {
        error:
          "No fue posible crear la invitación.",
      },
      {
        status: 500,
      },
    );
  }
}
